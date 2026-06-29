package eventbus

import "time"

// CameraState mirrors CONTRACTS §3.4: "stopped" | "connecting" | "live" | "error".
type CameraState string

const (
	StateStopped    CameraState = "stopped"
	StateConnecting CameraState = "connecting"
	StateLive       CameraState = "live"
	StateError      CameraState = "error"
)

// BoundingBox is a normalized [0,1] detection box, x,y = top-left.
// Matches CONTRACTS §2.1 boundingBoxes entries.
type BoundingBox struct {
	X          float64 `json:"x"`
	Y          float64 `json:"y"`
	W          float64 `json:"w"`
	H          float64 `json:"h"`
	Confidence float64 `json:"confidence"`
}

// Event is the canonical detection event POSTed to /internal/alerts.
// Field names and shape are pinned by CONTRACTS §2.1.
type Event struct {
	CameraID       string        `json:"cameraId"`
	Type           string        `json:"type"`  // always "person_detected"
	Label          string        `json:"label"` // always "person"
	Confidence     float64       `json:"confidence"`
	DetectionCount int           `json:"detectionCount"`
	BoundingBoxes  []BoundingBox `json:"boundingBoxes"`
	FrameTimestamp string        `json:"frameTimestamp"` // ISO-8601 UTC
}

// Stats is the per-camera stats payload POSTed to /internal/stats.
// Shape pinned by CONTRACTS §3.3.
type Stats struct {
	CameraID            string      `json:"cameraId"`
	FPS                 float64     `json:"fps"`
	DetectionsPerMinute int         `json:"detectionsPerMinute"`
	State               CameraState `json:"state"`
	Timestamp           string      `json:"timestamp"` // ISO-8601 UTC
}

// CameraStateMsg is POSTed to /internal/camera-state on every state transition.
type CameraStateMsg struct {
	CameraID string      `json:"cameraId"`
	State    CameraState `json:"state"`
	Message  string      `json:"message,omitempty"`
}

// nowISO returns the current time as ISO-8601 UTC with millisecond precision,
// matching the timestamps used elsewhere in CONTRACTS.
func nowISO() string {
	return time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
}
