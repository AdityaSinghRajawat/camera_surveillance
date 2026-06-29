package camera

import (
	"context"
	"fmt"
	"sync"

	"github.com/skylark/worker/internal/config"
	"github.com/skylark/worker/internal/eventbus"
	wrtc "github.com/skylark/worker/internal/webrtc"
	"github.com/skylark/worker/pkg/logger"
)

// Manager orchestrates the set of running cameras. It guarantees per-camera
// isolation: each camera has its own context derived from the manager's root
// context, so stopping or losing one camera never disturbs the others. The
// manager itself is safe for concurrent use.
type Manager struct {
	cfg         *config.Config
	log         logger.Logger
	pub         *eventbus.Publisher
	engine      *wrtc.EngineHandle
	newDetector DetectorFactory

	rootCtx context.Context

	mu      sync.Mutex
	cameras map[string]*Camera
}

// NewManager builds a Manager. rootCtx is the parent context for all cameras;
// cancelling it (graceful shutdown) stops every camera. newDetector builds a
// fresh per-camera Detector (injected so this package needs no OpenCV).
func NewManager(rootCtx context.Context, cfg *config.Config, log logger.Logger, pub *eventbus.Publisher, engine *wrtc.EngineHandle, newDetector DetectorFactory) *Manager {
	return &Manager{
		cfg:         cfg,
		log:         log,
		pub:         pub,
		engine:      engine,
		newDetector: newDetector,
		rootCtx:     rootCtx,
		cameras:     make(map[string]*Camera),
	}
}

// Start begins (or restarts) processing for a camera. It is idempotent: if the
// camera is already running it is stopped and restarted with the new RTSP URL.
// Returns an error only for invalid input.
func (m *Manager) Start(id, rtspURL string) error {
	if id == "" {
		return fmt.Errorf("manager: empty cameraId")
	}
	if rtspURL == "" {
		return fmt.Errorf("manager: empty rtspUrl")
	}

	m.mu.Lock()
	if existing, ok := m.cameras[id]; ok {
		// Idempotent restart: stop the old instance outside the lock to avoid
		// holding it during wg.Wait, but remove it from the map first.
		delete(m.cameras, id)
		m.mu.Unlock()
		existing.stop()
		m.mu.Lock()
	}

	cam := newCamera(m.rootCtx, id, rtspURL, m.cfg, m.log, m.pub, m.engine, m.newDetector)
	m.cameras[id] = cam
	m.mu.Unlock()

	cam.start()
	m.log.Info("camera started", "cameraId", id)
	return nil
}

// Stop stops a single camera, killing only its FFmpeg processes and goroutines.
// It is a no-op (nil error) if the camera is not running.
func (m *Manager) Stop(id string) error {
	m.mu.Lock()
	cam, ok := m.cameras[id]
	if ok {
		delete(m.cameras, id)
	}
	m.mu.Unlock()

	if !ok {
		return nil
	}
	cam.stop()
	m.log.Info("camera stopped", "cameraId", id)
	return nil
}

// HandleOffer routes a browser WebRTC offer to the named camera and returns the
// answer SDP. It errors if the camera is unknown or its stream is not ready.
func (m *Manager) HandleOffer(id, offerSDP string) (string, error) {
	m.mu.Lock()
	cam, ok := m.cameras[id]
	m.mu.Unlock()
	if !ok {
		return "", fmt.Errorf("manager: unknown cameraId %q", id)
	}
	return cam.HandleOffer(offerSDP)
}

// Count returns the number of cameras currently managed (running or in error).
func (m *Manager) Count() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.cameras)
}

// StopAll stops every camera concurrently and clears the map. Used during
// graceful shutdown. It waits for all cameras to finish stopping.
func (m *Manager) StopAll() {
	m.mu.Lock()
	cams := make([]*Camera, 0, len(m.cameras))
	for _, c := range m.cameras {
		cams = append(cams, c)
	}
	m.cameras = make(map[string]*Camera)
	m.mu.Unlock()

	var wg sync.WaitGroup
	for _, c := range cams {
		wg.Add(1)
		go func(cam *Camera) {
			defer wg.Done()
			cam.stop()
		}(c)
	}
	wg.Wait()
	m.log.Info("all cameras stopped")
}
