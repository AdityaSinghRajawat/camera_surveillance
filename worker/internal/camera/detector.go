package camera

import "github.com/skylark/worker/internal/detection/types"

// Detector is the minimal inference contract the camera pipeline needs. It is
// satisfied by *detection.Detector, but is declared here as an interface so the
// camera package itself does NOT import the gocv-bearing detection package and
// thus builds without OpenCV. The concrete implementation is injected via a
// DetectorFactory from cmd (app.go), which is the only place that imports gocv.
type Detector interface {
	// Detect runs inference on one raw bgr24 frame of frameW x frameH pixels and
	// returns the person detections (normalized [0,1]).
	Detect(bgr []byte, frameW, frameH int) ([]types.Detection, error)
	// Close releases native resources.
	Close() error
}

// DetectorFactory builds a fresh Detector for one camera (one net per camera
// for isolation). It returns an error if the model cannot be loaded.
type DetectorFactory func() (Detector, error)
