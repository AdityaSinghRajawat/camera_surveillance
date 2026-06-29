// Package rtsp ingests an RTSP stream for DETECTION by spawning FFmpeg and
// reading fixed-size raw bgr24 frames from its stdout. To keep frame sizing
// deterministic without a separate ffprobe round-trip, the FFmpeg filter forces
// a fixed output resolution (640x480), so every frame is exactly W*H*3 bytes.
// Frames are throttled to the detection interval before being delivered, so the
// detector is never overwhelmed regardless of the source frame rate.
package rtsp

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os/exec"
	"sync"
	"time"

	"github.com/skylark/worker/pkg/logger"
)

// Fixed decode output size handed to detection. Forcing a known size removes the
// need to probe the source and guarantees frame := W*H*3 bytes. Documented here
// and in the Dockerfile/README rationale.
const (
	FrameWidth  = 640
	FrameHeight = 480
	frameBytes  = FrameWidth * FrameHeight * 3
)

// Frame is one decoded BGR frame plus its capture time. The Data slice is owned
// by the receiver until the next Frames() read; copy it if retaining.
type Frame struct {
	Data       []byte
	Width      int
	Height     int
	CapturedAt time.Time
}

// Client runs an FFmpeg subprocess for one camera and exposes a channel of
// throttled raw frames. It is started with Run, which blocks until the process
// exits or ctx is cancelled; cancellation kills FFmpeg cleanly.
type Client struct {
	rtspURL  string
	cameraID string
	interval time.Duration
	log      logger.Logger

	frames chan Frame

	mu  sync.Mutex
	cmd *exec.Cmd
}

// New builds an RTSP client. interval is the minimum time between frames handed
// to detection (DETECTION_INTERVAL_MS).
func New(cameraID, rtspURL string, interval time.Duration, log logger.Logger) *Client {
	return &Client{
		rtspURL:  rtspURL,
		cameraID: cameraID,
		interval: interval,
		log:      log,
		frames:   make(chan Frame, 1),
	}
}

// Frames returns the channel of throttled decoded frames. It is closed when Run
// returns.
func (c *Client) Frames() <-chan Frame { return c.frames }

// ffmpegArgs builds the decode command. We force bgr24 + a fixed scale so the
// frame size is deterministic (see package doc).
func (c *Client) ffmpegArgs() []string {
	return []string{
		"-hide_banner",
		"-loglevel", "error",
		"-rtsp_transport", "tcp",
		"-i", c.rtspURL,
		"-an",
		"-f", "rawvideo",
		"-pix_fmt", "bgr24",
		"-vf", fmt.Sprintf("scale=%d:%d", FrameWidth, FrameHeight),
		"pipe:1",
	}
}

// Run spawns FFmpeg, reads fixed-size frames, throttles them to the configured
// interval and sends them on the frames channel until the process exits or ctx
// is cancelled. It always closes the frames channel and reaps the process
// before returning. A non-nil error means the FFmpeg pipeline failed (the
// caller treats this as a transient failure and may restart).
func (c *Client) Run(ctx context.Context) (err error) {
	defer close(c.frames)

	cmd := exec.Command("ffmpeg", c.ffmpegArgs()...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("rtsp: stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("rtsp: stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("rtsp: start ffmpeg: %w", err)
	}

	c.mu.Lock()
	c.cmd = cmd
	c.mu.Unlock()

	// Drain stderr to the log so ffmpeg errors are visible and the pipe never
	// blocks the process.
	go c.logStderr(stderr)

	// Kill ffmpeg when the context is cancelled.
	done := make(chan struct{})
	defer close(done)
	go func() {
		select {
		case <-ctx.Done():
			c.kill()
		case <-done:
		}
	}()

	readErr := c.readFrames(ctx, stdout)

	waitErr := cmd.Wait()

	c.mu.Lock()
	c.cmd = nil
	c.mu.Unlock()

	if ctx.Err() != nil {
		return ctx.Err()
	}
	if readErr != nil && readErr != io.EOF {
		return fmt.Errorf("rtsp: read frames: %w", readErr)
	}
	if waitErr != nil {
		return fmt.Errorf("rtsp: ffmpeg exited: %w", waitErr)
	}
	// FFmpeg exited cleanly (stream ended) — signal restart to the caller.
	return fmt.Errorf("rtsp: ffmpeg stream ended")
}

// readFrames reads exact-size frames and forwards them, throttled to interval.
func (c *Client) readFrames(ctx context.Context, r io.Reader) error {
	br := bufio.NewReaderSize(r, frameBytes)
	var lastSent time.Time
	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		buf := make([]byte, frameBytes)
		if _, err := io.ReadFull(br, buf); err != nil {
			return err
		}

		now := time.Now()
		// Throttle: only hand frames to detection every `interval`.
		if !lastSent.IsZero() && now.Sub(lastSent) < c.interval {
			continue
		}
		lastSent = now

		frame := Frame{
			Data:       buf,
			Width:      FrameWidth,
			Height:     FrameHeight,
			CapturedAt: now,
		}
		select {
		case c.frames <- frame:
		case <-ctx.Done():
			return ctx.Err()
		default:
			// Detection still busy with the previous frame; drop this one to
			// stay real-time rather than building a backlog.
		}
	}
}

// logStderr forwards ffmpeg stderr lines to the logger at warn level.
func (c *Client) logStderr(r io.Reader) {
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for sc.Scan() {
		line := sc.Text()
		if line == "" {
			continue
		}
		c.log.Warn("ffmpeg(detect)", "cameraId", c.cameraID, "msg", line)
	}
}

// kill terminates the FFmpeg process if running.
func (c *Client) kill() {
	c.mu.Lock()
	cmd := c.cmd
	c.mu.Unlock()
	if cmd != nil && cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
}
