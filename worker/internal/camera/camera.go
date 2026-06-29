// Package camera implements per-camera lifecycle and isolation. Each Camera
// owns its own context, FFmpeg processes, OpenCV net, WebRTC stream and
// goroutines, so a failure in one camera can never affect another. The manager
// (manager.go) orchestrates the map of cameras; this file is a single camera's
// state machine and supervised pipeline.
package camera

import (
	"context"
	"runtime/debug"
	"sync"
	"time"

	"github.com/skylark/worker/internal/config"
	"github.com/skylark/worker/internal/eventbus"
	"github.com/skylark/worker/internal/rtsp"
	wrtc "github.com/skylark/worker/internal/webrtc"
	"github.com/skylark/worker/pkg/logger"
	"github.com/skylark/worker/pkg/retry"
)

// Camera is one supervised camera pipeline.
type Camera struct {
	id      string
	rtspURL string

	cfg         *config.Config
	log         logger.Logger
	pub         *eventbus.Publisher
	engine      *wrtc.EngineHandle
	newDetector DetectorFactory

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup

	mu     sync.Mutex
	state  eventbus.CameraState
	stream *wrtc.Stream

	// stats counters (atomic-ish under statsMu)
	statsMu         sync.Mutex
	framesSinceTick int
	detsWindow      []time.Time // detection event times for detectionsPerMinute
}

// newCamera constructs a Camera bound to the parent context. cancel stops only
// this camera.
func newCamera(parent context.Context, id, rtspURL string, cfg *config.Config, log logger.Logger, pub *eventbus.Publisher, engine *wrtc.EngineHandle, newDetector DetectorFactory) *Camera {
	ctx, cancel := context.WithCancel(parent)
	return &Camera{
		id:          id,
		rtspURL:     rtspURL,
		cfg:         cfg,
		log:         log.With("cameraId", id),
		pub:         pub,
		engine:      engine,
		newDetector: newDetector,
		ctx:         ctx,
		cancel:      cancel,
		state:       eventbus.StateStopped,
	}
}

// ID returns the camera id.
func (c *Camera) ID() string { return c.id }

// State returns the current state (thread-safe).
func (c *Camera) State() eventbus.CameraState {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.state
}

// setState updates state and publishes the transition (deduped by equality).
func (c *Camera) setState(state eventbus.CameraState, message string) {
	c.mu.Lock()
	if c.state == state {
		c.mu.Unlock()
		return
	}
	c.state = state
	c.mu.Unlock()
	c.log.Info("camera state", "state", string(state), "message", message)
	c.pub.PublishCameraState(c.ctx, c.id, state, message)
}

// start launches the supervised pipeline goroutines. It returns immediately;
// the pipeline runs in the background until stop() or context cancellation.
func (c *Camera) start() {
	c.setState(eventbus.StateConnecting, "")

	// WebRTC stream (transcode) supervisor.
	c.wg.Add(1)
	go func() {
		defer c.wg.Done()
		c.supervise("webrtc", c.runWebRTC)
	}()

	// Detection pipeline supervisor.
	c.wg.Add(1)
	go func() {
		defer c.wg.Done()
		c.supervise("detection", c.runDetection)
	}()

	// Stats emitter.
	c.wg.Add(1)
	go func() {
		defer c.wg.Done()
		c.runStats()
	}()
}

// stop cancels this camera only, tears down the WebRTC stream and waits for all
// goroutines to exit (killing FFmpeg via context). It publishes the stopped
// state.
func (c *Camera) stop() {
	c.cancel()

	c.mu.Lock()
	stream := c.stream
	c.stream = nil
	c.mu.Unlock()
	if stream != nil {
		stream.Close()
	}

	c.wg.Wait()
	c.pub.ResetDedup(c.id)
	c.setStateForced(eventbus.StateStopped, "")
}

// setStateForced sets state even during shutdown using a background context so
// the final transition is still published after cancel.
func (c *Camera) setStateForced(state eventbus.CameraState, message string) {
	c.mu.Lock()
	c.state = state
	c.mu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c.pub.PublishCameraState(ctx, c.id, state, message)
}

// supervise runs fn with panic recovery and capped-backoff auto-restart on
// transient failure. It exits when the context is cancelled. On giving up it
// transitions the camera to error state. A panic in fn is recovered so it can
// never crash the process or other cameras.
func (c *Camera) supervise(name string, fn func(ctx context.Context) error) {
	cfg := retry.DefaultConfig()
	err := retry.Do(c.ctx, cfg, func() (opErr error) {
		defer func() {
			if r := recover(); r != nil {
				c.log.Error("pipeline panic recovered", "pipeline", name, "panic", r, "stack", string(debug.Stack()))
				opErr = errPanic
			}
		}()
		return fn(c.ctx)
	})

	if c.ctx.Err() != nil {
		// Normal shutdown.
		return
	}
	if err != nil {
		c.log.Error("pipeline gave up", "pipeline", name, "error", err)
		c.setState(eventbus.StateError, name+": "+err.Error())
	}
}

// runWebRTC creates and runs the per-camera WebRTC transcode stream. The shared
// track must exist (created here) before offers can attach to it; the manager
// reads it via Stream(). When the stream is up the camera is "live".
func (c *Camera) runWebRTC(ctx context.Context) error {
	stream, err := wrtc.NewStream(c.id, c.rtspURL, c.engine, c.log)
	if err != nil {
		return err
	}
	c.mu.Lock()
	// Close any previous stream from a prior restart before swapping.
	if c.stream != nil {
		c.stream.Close()
	}
	c.stream = stream
	c.mu.Unlock()

	// Once the transcoder is running we consider the camera live.
	c.setState(eventbus.StateLive, "")
	return stream.Run(ctx)
}

// runDetection owns RTSP ingestion + inference for this camera. It creates a
// dedicated OpenCV net (isolation), reads throttled bgr24 frames, runs the
// detector and publishes person alerts.
func (c *Camera) runDetection(ctx context.Context) error {
	detector, err := c.newDetector()
	if err != nil {
		return err
	}
	defer func() { _ = detector.Close() }()

	client := rtsp.New(c.id, c.rtspURL, c.cfg.DetectionInterval(), c.log)

	// Run ffmpeg ingestion in the background; consume frames here.
	runErrCh := make(chan error, 1)
	go func() {
		runErrCh <- client.Run(ctx)
	}()

	for {
		select {
		case <-ctx.Done():
			<-runErrCh
			return ctx.Err()
		case err := <-runErrCh:
			// ffmpeg ended; surface error so supervisor restarts.
			if err == nil {
				return errStreamEnded
			}
			return err
		case frame, ok := <-client.Frames():
			if !ok {
				// channel closed: wait for run result.
				if err := <-runErrCh; err != nil {
					return err
				}
				return errStreamEnded
			}
			c.handleFrame(ctx, detector, frame)
		}
	}
}

// handleFrame runs detection on one frame and publishes alerts/updates stats.
func (c *Camera) handleFrame(ctx context.Context, detector Detector, frame rtsp.Frame) {
	c.statsMu.Lock()
	c.framesSinceTick++
	c.statsMu.Unlock()

	dets, err := detector.Detect(frame.Data, frame.Width, frame.Height)
	if err != nil {
		c.log.Warn("detect error", "error", err)
		return
	}
	if len(dets) == 0 {
		return
	}
	if c.pub.PublishDetections(ctx, c.id, dets, frame.CapturedAt) {
		c.recordDetection()
	}
}

// recordDetection appends now to the rolling detection window for stats.
func (c *Camera) recordDetection() {
	c.statsMu.Lock()
	c.detsWindow = append(c.detsWindow, time.Now())
	c.statsMu.Unlock()
}

// runStats emits per-camera stats every STATS_INTERVAL_MS until cancelled.
func (c *Camera) runStats() {
	interval := c.cfg.StatsInterval()
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-c.ctx.Done():
			return
		case <-ticker.C:
			c.emitStats(interval)
		}
	}
}

// emitStats computes fps over the interval and detectionsPerMinute over a
// rolling 60s window, then publishes.
func (c *Camera) emitStats(interval time.Duration) {
	c.statsMu.Lock()
	frames := c.framesSinceTick
	c.framesSinceTick = 0

	cutoff := time.Now().Add(-time.Minute)
	kept := c.detsWindow[:0]
	for _, t := range c.detsWindow {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	c.detsWindow = kept
	detsPerMin := len(c.detsWindow)
	c.statsMu.Unlock()

	fps := float64(frames) / interval.Seconds()

	c.pub.PublishStats(c.ctx, eventbus.Stats{
		CameraID:            c.id,
		FPS:                 round1(fps),
		DetectionsPerMinute: detsPerMin,
		State:               c.State(),
		Timestamp:           time.Now().UTC().Format("2006-01-02T15:04:05.000Z"),
	})
}

// HandleOffer forwards a browser offer to this camera's WebRTC stream and
// returns the answer SDP. It errors if the stream is not yet up.
func (c *Camera) HandleOffer(offerSDP string) (string, error) {
	c.mu.Lock()
	stream := c.stream
	c.mu.Unlock()
	if stream == nil {
		return "", errStreamNotReady
	}
	return stream.HandleOffer(offerSDP)
}

func round1(v float64) float64 {
	return float64(int(v*10+0.5)) / 10
}
