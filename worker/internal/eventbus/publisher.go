// Package eventbus builds the canonical worker→backend payloads (alerts, stats,
// camera-state) and publishes them via the httpclient. It owns alert
// deduplication / rate limiting and ensures a failed POST is logged and retried
// with backoff but NEVER propagated in a way that could kill a camera pipeline.
package eventbus

import (
	"context"
	"sync"
	"time"

	dtypes "github.com/skylark/worker/internal/detection/types"
	"github.com/skylark/worker/internal/httpclient"
	"github.com/skylark/worker/pkg/logger"
	"github.com/skylark/worker/pkg/retry"
)

// Backend paths relative to BACKEND_INTERNAL_URL (CONTRACTS §4.5).
const (
	pathAlerts      = "/internal/alerts"
	pathStats       = "/internal/stats"
	pathCameraState = "/internal/camera-state"
)

// poster is the minimal interface the publisher needs; *httpclient.Client
// satisfies it. Declaring it here keeps the dependency direction clean and makes
// the publisher testable.
type poster interface {
	PostJSON(ctx context.Context, path string, body any) error
}

var _ poster = (*httpclient.Client)(nil)

// Publisher serializes and ships events for the whole worker. It is safe for
// concurrent use by many cameras. Dedup state is keyed by cameraId.
type Publisher struct {
	client   poster
	log      logger.Logger
	dedupWin time.Duration
	retryCfg retry.Config

	mu       sync.Mutex
	lastSent map[string]time.Time // cameraId -> last alert send time (dedup window)
}

// New constructs a Publisher. dedupWindow suppresses repeat alerts for the same
// camera within the window (CONTRACTS §7 ALERT_DEDUP_WINDOW_MS).
func New(client poster, log logger.Logger, dedupWindow time.Duration) *Publisher {
	cfg := retry.DefaultConfig()
	// Bound POST retries so a persistently-down backend cannot make a single
	// publish run forever; drop after the cap (logged).
	cfg.MaxAttempts = 4
	cfg.InitialDelay = 300 * time.Millisecond
	cfg.MaxDelay = 3 * time.Second
	return &Publisher{
		client:   client,
		log:      log,
		dedupWin: dedupWindow,
		retryCfg: cfg,
		lastSent: make(map[string]time.Time),
	}
}

// PublishDetections builds a canonical Event from the detections of one frame
// and POSTs it to /internal/alerts, subject to per-camera dedup/rate limiting.
// frameTS is when the frame was captured. It returns true if an alert was
// actually sent (i.e. not suppressed). Detections must be non-empty; callers
// only invoke this when at least one person was found.
func (p *Publisher) PublishDetections(ctx context.Context, cameraID string, dets []dtypes.Detection, frameTS time.Time) bool {
	if len(dets) == 0 {
		return false
	}
	if !p.allow(cameraID) {
		return false
	}

	boxes := make([]BoundingBox, 0, len(dets))
	maxConf := 0.0
	for _, d := range dets {
		if d.Confidence > maxConf {
			maxConf = d.Confidence
		}
		boxes = append(boxes, BoundingBox{
			X:          clamp01(d.X),
			Y:          clamp01(d.Y),
			W:          clamp01(d.W),
			H:          clamp01(d.H),
			Confidence: d.Confidence,
		})
	}

	evt := Event{
		CameraID:       cameraID,
		Type:           "person_detected",
		Label:          "person",
		Confidence:     maxConf,
		DetectionCount: len(dets),
		BoundingBoxes:  boxes,
		FrameTimestamp: frameTS.UTC().Format("2006-01-02T15:04:05.000Z"),
	}

	p.send(ctx, pathAlerts, evt, "alert")
	return true
}

// PublishStats POSTs a Stats payload to /internal/stats.
func (p *Publisher) PublishStats(ctx context.Context, s Stats) {
	if s.Timestamp == "" {
		s.Timestamp = nowISO()
	}
	p.send(ctx, pathStats, s, "stats")
}

// PublishCameraState POSTs a camera-state transition to /internal/camera-state.
func (p *Publisher) PublishCameraState(ctx context.Context, cameraID string, state CameraState, message string) {
	msg := CameraStateMsg{CameraID: cameraID, State: state, Message: message}
	p.send(ctx, pathCameraState, msg, "camera-state")
}

// allow implements the dedup / rate-limit gate: at most one alert per camera per
// dedup window. It records the send time when it returns true.
func (p *Publisher) allow(cameraID string) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	now := time.Now()
	if last, ok := p.lastSent[cameraID]; ok {
		if now.Sub(last) < p.dedupWin {
			return false
		}
	}
	p.lastSent[cameraID] = now
	return true
}

// ResetDedup clears dedup state for a camera (called on stop) so a restarted
// camera can alert immediately.
func (p *Publisher) ResetDedup(cameraID string) {
	p.mu.Lock()
	delete(p.lastSent, cameraID)
	p.mu.Unlock()
}

// send POSTs with bounded backoff. Failures are logged and swallowed: a publish
// must never kill a camera pipeline (per the assignment).
func (p *Publisher) send(ctx context.Context, path string, body any, kind string) {
	err := retry.Do(ctx, p.retryCfg, func() error {
		return p.client.PostJSON(ctx, path, body)
	})
	if err != nil && ctx.Err() == nil {
		p.log.Warn("publish failed (dropped after retries)", "kind", kind, "path", path, "error", err)
	}
}

func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}
