#!/usr/bin/env sh
# Download the MobileNet-SSD (Caffe, VOC) model files used by the detector
# (CONTRACTS §6). Idempotent: existing, non-empty files are left untouched.
#
# Destination defaults to /models (matches DETECTION_PROTOTXT / DETECTION_MODEL
# defaults). Override with MODELS_DIR.
set -eu

MODELS_DIR="${MODELS_DIR:-/models}"
mkdir -p "$MODELS_DIR"

PROTOTXT="$MODELS_DIR/MobileNetSSD_deploy.prototxt"
CAFFEMODEL="$MODELS_DIR/MobileNetSSD_deploy.caffemodel"

# Known-good public sources. djmv/MobilNet_SSD_opencv is the classic OpenCV
# sample repo and ships a MATCHED prototxt+caffemodel pair, so it is the primary
# for both (using a matched pair avoids prototxt/weights mismatch). A second
# public mirror is used as the caffemodel fallback.
PROTOTXT_URL="https://raw.githubusercontent.com/djmv/MobilNet_SSD_opencv/master/MobileNetSSD_deploy.prototxt"
PROTOTXT_URL_FALLBACK="https://raw.githubusercontent.com/chuanqi305/MobileNet-SSD/master/deploy.prototxt"
CAFFEMODEL_URL_PRIMARY="https://raw.githubusercontent.com/djmv/MobilNet_SSD_opencv/master/MobileNetSSD_deploy.caffemodel"
CAFFEMODEL_URL_FALLBACK="https://github.com/PINTO0309/MobileNet-SSD-RealSense/raw/master/caffemodel/MobileNetSSD/MobileNetSSD_deploy.caffemodel"

download() {
	# $1 = url, $2 = dest
	if command -v curl >/dev/null 2>&1; then
		curl -fSL --retry 3 -o "$2" "$1"
	else
		wget -O "$2" "$1"
	fi
}

nonempty() {
	[ -s "$1" ]
}

if nonempty "$PROTOTXT"; then
	echo "prototxt already present: $PROTOTXT"
else
	echo "downloading prototxt -> $PROTOTXT"
	if ! download "$PROTOTXT_URL" "$PROTOTXT" || ! nonempty "$PROTOTXT"; then
		echo "primary prototxt failed; trying fallback"
		download "$PROTOTXT_URL_FALLBACK" "$PROTOTXT"
	fi
fi

if nonempty "$CAFFEMODEL"; then
	echo "caffemodel already present: $CAFFEMODEL"
else
	echo "downloading caffemodel (primary) -> $CAFFEMODEL"
	if ! download "$CAFFEMODEL_URL_PRIMARY" "$CAFFEMODEL" || ! nonempty "$CAFFEMODEL"; then
		echo "primary failed; trying fallback mirror"
		download "$CAFFEMODEL_URL_FALLBACK" "$CAFFEMODEL"
	fi
fi

echo "model files ready in $MODELS_DIR"
ls -la "$MODELS_DIR"
