// Package types holds the plain, OpenCV-free data types produced by the
// detector. It is deliberately separate from the parent detection package
// (which imports gocv/CGO) so that consumers such as internal/eventbus and
// internal/camera can reference detection results and compile on any machine
// WITHOUT OpenCV installed. Only internal/detection itself needs OpenCV.
package types

// Detection is a single person detection in normalized [0,1] coordinates, with
// x,y as the top-left corner of the box. It carries no OpenCV types so it can
// cross package boundaries freely.
type Detection struct {
	X          float64
	Y          float64
	W          float64
	H          float64
	Confidence float64
}
