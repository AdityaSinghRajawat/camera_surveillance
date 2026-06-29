// Package webrtc re-streams a camera's RTSP feed to browsers over WebRTC using
// pion. Per camera it runs a second FFmpeg that transcodes the source to
// WebRTC-compatible H.264 Annex-B, parses NAL units with the pion h264reader and
// writes them as media samples into ONE shared *webrtc.TrackLocalStaticSample.
// Every browser offer creates a fresh PeerConnection that adds that shared
// track, so many viewers can watch one camera. A process-wide ICE UDP mux binds
// the single WEBRTC_UDP_PORT and NAT 1-to-1 advertises WEBRTC_PUBLIC_IP so a
// browser on the host can reach the candidate.
package webrtc

import (
	"context"
	"fmt"
	"io"
	"net"
	"os/exec"
	"sync"
	"time"

	"github.com/pion/webrtc/v3"
	"github.com/pion/webrtc/v3/pkg/media"
	"github.com/pion/webrtc/v3/pkg/media/h264reader"

	"github.com/skylark/worker/pkg/logger"
)

// sampleDuration is the per-NAL sample duration (~30fps).
const sampleDuration = 33 * time.Millisecond

// NewEngine binds a UDP socket on udpPort, wires an ICE UDP mux over it and
// builds a pion API that advertises publicIP as a NAT 1-to-1 host candidate.
// Call Close on shutdown to release the socket.
func NewEngine(udpPort int, publicIP string, log logger.Logger) (*EngineHandle, error) {
	udpConn, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.IPv4zero, Port: udpPort})
	if err != nil {
		return nil, fmt.Errorf("webrtc: bind udp mux :%d: %w", udpPort, err)
	}

	se := webrtc.SettingEngine{}
	mux := webrtc.NewICEUDPMux(nil, udpConn)
	se.SetICEUDPMux(mux)
	// Advertise the reachable host IP so browser-side candidates can connect
	// through the single published port.
	se.SetNAT1To1IPs([]string{publicIP}, webrtc.ICECandidateTypeHost)

	me := &webrtc.MediaEngine{}
	if err := me.RegisterDefaultCodecs(); err != nil {
		_ = udpConn.Close()
		return nil, fmt.Errorf("webrtc: register codecs: %w", err)
	}

	api := webrtc.NewAPI(webrtc.WithMediaEngine(me), webrtc.WithSettingEngine(se))

	return &EngineHandle{
		api:  api,
		conn: udpConn,
		log:  log,
	}, nil
}

// EngineHandle is the shared, closable WebRTC engine.
type EngineHandle struct {
	api  *webrtc.API
	conn *net.UDPConn
	log  logger.Logger
}

// Close releases the UDP mux socket.
func (e *EngineHandle) Close() error {
	if e.conn != nil {
		return e.conn.Close()
	}
	return nil
}

// Stream owns one camera's WebRTC re-stream: the shared video track, the
// transcoding FFmpeg, and all viewer PeerConnections. Offers may arrive
// concurrently with the feed running; the shared track simply fans out samples.
type Stream struct {
	cameraID string
	rtspURL  string
	engine   *EngineHandle
	log      logger.Logger

	track *webrtc.TrackLocalStaticSample

	mu    sync.Mutex
	cmd   *exec.Cmd
	peers map[*webrtc.PeerConnection]struct{}
}

// NewStream creates the shared H264 track for a camera. The feed is started
// separately via Run (typically at camera start so state can reach "live").
func NewStream(cameraID, rtspURL string, engine *EngineHandle, log logger.Logger) (*Stream, error) {
	track, err := webrtc.NewTrackLocalStaticSample(
		webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeH264},
		"video", "skylark-"+cameraID,
	)
	if err != nil {
		return nil, fmt.Errorf("webrtc: create track: %w", err)
	}
	return &Stream{
		cameraID: cameraID,
		rtspURL:  rtspURL,
		engine:   engine,
		log:      log,
		track:    track,
		peers:    make(map[*webrtc.PeerConnection]struct{}),
	}, nil
}

// ffmpegArgs builds the transcode-to-H264-AnnexB command for browser playback.
func (s *Stream) ffmpegArgs() []string {
	return []string{
		"-hide_banner",
		"-loglevel", "error",
		"-rtsp_transport", "tcp",
		"-i", s.rtspURL,
		"-an",
		"-c:v", "libx264",
		"-preset", "ultrafast",
		"-tune", "zerolatency",
		"-profile:v", "baseline",
		"-pix_fmt", "yuv420p",
		"-g", "30",
		"-bsf:v", "h264_mp4toannexb",
		"-f", "h264",
		"pipe:1",
	}
}

// Run starts the transcoding FFmpeg and pumps NAL units into the shared track
// until the process exits or ctx is cancelled. It returns a non-nil error on
// pipeline failure so the camera supervisor can restart it. The frames channel
// is the track itself, shared by all current and future viewers.
func (s *Stream) Run(ctx context.Context) error {
	cmd := exec.Command("ffmpeg", s.ffmpegArgs()...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("webrtc: stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("webrtc: stderr pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("webrtc: start ffmpeg: %w", err)
	}

	s.mu.Lock()
	s.cmd = cmd
	s.mu.Unlock()

	go s.logStderr(stderr)

	done := make(chan struct{})
	defer close(done)
	go func() {
		select {
		case <-ctx.Done():
			s.killFFmpeg()
		case <-done:
		}
	}()

	writeErr := s.pumpNALs(ctx, stdout)
	waitErr := cmd.Wait()

	s.mu.Lock()
	s.cmd = nil
	s.mu.Unlock()

	if ctx.Err() != nil {
		return ctx.Err()
	}
	if writeErr != nil && writeErr != io.EOF {
		return fmt.Errorf("webrtc: pump nals: %w", writeErr)
	}
	if waitErr != nil {
		return fmt.Errorf("webrtc: ffmpeg exited: %w", waitErr)
	}
	return fmt.Errorf("webrtc: ffmpeg stream ended")
}

// pumpNALs reads H264 NAL units and writes each as a media sample into the
// shared track.
func (s *Stream) pumpNALs(ctx context.Context, r io.Reader) error {
	reader, err := h264reader.NewReader(r)
	if err != nil {
		return fmt.Errorf("h264reader: %w", err)
	}
	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		nal, err := reader.NextNAL()
		if err != nil {
			return err
		}
		if err := s.track.WriteSample(media.Sample{
			Data:     nal.Data,
			Duration: sampleDuration,
		}); err != nil {
			// No subscribers yet (ErrClosedPipe) is fine; keep going.
			if err == io.ErrClosedPipe {
				continue
			}
			return fmt.Errorf("write sample: %w", err)
		}
	}
}

// HandleOffer creates a new PeerConnection for a viewer, attaches the shared
// track, applies the remote offer, produces an answer and blocks until ICE
// gathering completes so the returned SDP is fully populated for the
// single-port mux. The PeerConnection self-cleans on failed/closed/disconnected.
func (s *Stream) HandleOffer(offerSDP string) (string, error) {
	pc, err := s.engine.api.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		return "", fmt.Errorf("webrtc: new peer connection: %w", err)
	}

	if _, err := pc.AddTrack(s.track); err != nil {
		_ = pc.Close()
		return "", fmt.Errorf("webrtc: add track: %w", err)
	}

	s.mu.Lock()
	s.peers[pc] = struct{}{}
	s.mu.Unlock()

	pc.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		s.log.Debug("peer state", "cameraId", s.cameraID, "state", state.String())
		switch state {
		case webrtc.PeerConnectionStateFailed,
			webrtc.PeerConnectionStateClosed,
			webrtc.PeerConnectionStateDisconnected:
			s.removePeer(pc)
		}
	})

	offer := webrtc.SessionDescription{
		Type: webrtc.SDPTypeOffer,
		SDP:  offerSDP,
	}
	if err := pc.SetRemoteDescription(offer); err != nil {
		s.removePeer(pc)
		return "", fmt.Errorf("webrtc: set remote desc: %w", err)
	}

	answer, err := pc.CreateAnswer(nil)
	if err != nil {
		s.removePeer(pc)
		return "", fmt.Errorf("webrtc: create answer: %w", err)
	}

	gatherComplete := webrtc.GatheringCompletePromise(pc)
	if err := pc.SetLocalDescription(answer); err != nil {
		s.removePeer(pc)
		return "", fmt.Errorf("webrtc: set local desc: %w", err)
	}
	<-gatherComplete

	local := pc.LocalDescription()
	if local == nil {
		s.removePeer(pc)
		return "", fmt.Errorf("webrtc: nil local description")
	}
	return local.SDP, nil
}

// removePeer closes and forgets a PeerConnection.
func (s *Stream) removePeer(pc *webrtc.PeerConnection) {
	s.mu.Lock()
	if _, ok := s.peers[pc]; ok {
		delete(s.peers, pc)
	}
	s.mu.Unlock()
	_ = pc.Close()
}

// Close tears down all viewer PeerConnections and kills the transcode FFmpeg.
func (s *Stream) Close() {
	s.mu.Lock()
	peers := make([]*webrtc.PeerConnection, 0, len(s.peers))
	for pc := range s.peers {
		peers = append(peers, pc)
	}
	s.peers = make(map[*webrtc.PeerConnection]struct{})
	s.mu.Unlock()

	for _, pc := range peers {
		_ = pc.Close()
	}
	s.killFFmpeg()
}

func (s *Stream) killFFmpeg() {
	s.mu.Lock()
	cmd := s.cmd
	s.mu.Unlock()
	if cmd != nil && cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
}

func (s *Stream) logStderr(r io.Reader) {
	buf := make([]byte, 4096)
	for {
		n, err := r.Read(buf)
		if n > 0 {
			s.log.Warn("ffmpeg(webrtc)", "cameraId", s.cameraID, "msg", string(buf[:n]))
		}
		if err != nil {
			return
		}
	}
}
