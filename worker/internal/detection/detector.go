// Package detection runs the MobileNet-SSD (Caffe / VOC) person detector via the
// OpenCV DNN module through GoCV.
//
// BUILD NOTE: this package is the ONLY part of the worker that requires CGO +
// OpenCV (it imports gocv.io/x/gocv) and therefore only compiles inside an
// environment with the OpenCV dev libraries installed (the Dockerfile's
// hybridgroup/opencv base). Every other package builds with a plain `go build`
// on any machine. The plain result type lives in the gocv-free sub-package
// internal/detection/types so dependents (eventbus, camera) compile without
// OpenCV.
package detection

import (
	"fmt"
	"image"
	"sync"

	"github.com/skylark/worker/internal/detection/types"
	"gocv.io/x/gocv"
)

// personClassID is class 15 in the 21-class VOC label set (CONTRACTS §6).
const personClassID = 15

// Model input parameters pinned by CONTRACTS §6.
const (
	inputW    = 300
	inputH    = 300
	blobScale = 0.007843
	blobMean  = 127.5
	swapRB    = false
	cropBlob  = false
)

// Detector wraps a single OpenCV DNN net loaded from the MobileNet-SSD Caffe
// files. One Detector is created PER CAMERA so cameras never share inference
// state (isolation). It is safe to call Detect serially from one camera's
// detection goroutine; access is guarded by a mutex defensively.
type Detector struct {
	mu         sync.Mutex
	net        gocv.Net
	confidence float64
	closed     bool
}

// NewDetector loads the prototxt + caffemodel and returns a ready Detector.
// confidence is the minimum score to keep a detection (CONTRACTS §6 default
// 0.5). The caller MUST call Close to release the native net.
func NewDetector(prototxt, model string, confidence float64) (*Detector, error) {
	net := gocv.ReadNetFromCaffe(prototxt, model)
	if net.Empty() {
		return nil, fmt.Errorf("detection: failed to load model (prototxt=%s model=%s)", prototxt, model)
	}
	// CPU inference, default OpenCV backend/target.
	_ = net.SetPreferableBackend(gocv.NetBackendDefault)
	_ = net.SetPreferableTarget(gocv.NetTargetCPU)
	return &Detector{
		net:        net,
		confidence: confidence,
	}, nil
}

// Detect runs inference on one raw bgr24 frame and returns the person
// detections at or above the confidence threshold. frameW/frameH are the pixel
// dimensions of the bgr24 buffer. The returned boxes are already normalized to
// [0,1] because the SSD output is normalized. All intermediate Mats are
// released before returning (no native leaks).
func (d *Detector) Detect(bgr []byte, frameW, frameH int) ([]types.Detection, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.closed {
		return nil, fmt.Errorf("detection: detector closed")
	}

	expected := frameW * frameH * 3
	if len(bgr) < expected {
		return nil, fmt.Errorf("detection: frame too small: have %d want %d", len(bgr), expected)
	}

	// Wrap the raw bytes in a Mat without copying ownership of the slice.
	mat, err := gocv.NewMatFromBytes(frameH, frameW, gocv.MatTypeCV8UC3, bgr[:expected])
	if err != nil {
		return nil, fmt.Errorf("detection: build mat: %w", err)
	}
	defer mat.Close()

	blob := gocv.BlobFromImage(mat, blobScale, image.Pt(inputW, inputH),
		gocv.NewScalar(blobMean, blobMean, blobMean, 0), swapRB, cropBlob)
	defer blob.Close()

	d.net.SetInput(blob, "")

	out := d.net.Forward("")
	defer out.Close()

	return parseSSD(out, d.confidence), nil
}

// parseSSD reads the [1,1,N,7] detection blob and extracts person boxes.
// Each row is [_, classId, confidence, x1, y1, x2, y2] with coords already in
// [0,1]. The blob is flattened to a contiguous float32 buffer for indexing.
func parseSSD(out gocv.Mat, minConf float64) []types.Detection {
	// Total number of float32 values in the output.
	total := out.Total()
	if total == 0 {
		return nil
	}
	// Reshape to a single channel, total/7 rows of 7 columns to access by index.
	const cols = 7
	rows := total / cols
	if rows == 0 {
		return nil
	}

	data, err := out.DataPtrFloat32()
	if err != nil || len(data) < rows*cols {
		return nil
	}

	dets := make([]types.Detection, 0, 4)
	for i := 0; i < rows; i++ {
		base := i * cols
		classID := int(data[base+1])
		conf := float64(data[base+2])
		if classID != personClassID || conf < minConf {
			continue
		}
		x1 := float64(data[base+3])
		y1 := float64(data[base+4])
		x2 := float64(data[base+5])
		y2 := float64(data[base+6])

		x := clamp01(x1)
		y := clamp01(y1)
		w := clamp01(x2) - x
		h := clamp01(y2) - y
		if w <= 0 || h <= 0 {
			continue
		}
		dets = append(dets, types.Detection{
			X:          x,
			Y:          y,
			W:          w,
			H:          h,
			Confidence: conf,
		})
	}
	return dets
}

// Close releases the native net. Safe to call multiple times.
func (d *Detector) Close() error {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.closed {
		return nil
	}
	d.closed = true
	return d.net.Close()
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
