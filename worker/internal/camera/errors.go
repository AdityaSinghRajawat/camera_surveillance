package camera

import "errors"

var (
	// errPanic marks a recovered panic so the supervisor treats it as a
	// transient failure and restarts the pipeline.
	errPanic = errors.New("camera: pipeline panic")
	// errStreamEnded indicates an ffmpeg pipeline ended cleanly (e.g. source
	// closed); the supervisor restarts.
	errStreamEnded = errors.New("camera: stream ended")
	// errStreamNotReady is returned when a WebRTC offer arrives before the
	// camera's shared track is up.
	errStreamNotReady = errors.New("camera: webrtc stream not ready")
)

// ErrStreamNotReady is the exported form for callers (control server) that need
// to distinguish "not yet live" from other failures.
var ErrStreamNotReady = errStreamNotReady
