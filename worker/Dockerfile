# Skylark Worker image.
#
# Base-image choice: gocv (gocv.io/x/gocv) is a CGO binding to OpenCV, so the
# build needs BOTH a Go toolchain AND the OpenCV development headers/libraries,
# and the runtime needs the OpenCV shared libraries. The ghcr.io/hybridgroup/opencv
# image bundles OpenCV (compiled) together with the Go toolchain, which makes it
# the simplest correct base for the gocv CGO build. We use a single stage from
# that image, add ffmpeg (used for RTSP decode + H264 transcode), fetch the
# MobileNet-SSD model files, build the binary, and run it. The ONLY package that
# requires OpenCV+CGO is internal/detection; everything else is pure Go.
FROM ghcr.io/hybridgroup/opencv:4.11.0

# ffmpeg: RTSP ingestion (raw bgr24 for detection) + libx264 transcode (WebRTC).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache module downloads.
COPY go.mod go.sum* ./
RUN go mod download || true

# Source.
COPY . .

# Seed /models from any vendored files copied above (worker/models -> /app/models),
# then fetch whatever is still missing (CONTRACTS §6). The prototxt is always
# vendored; the ~23MB caffemodel is vendored when present locally, otherwise
# downloaded. This makes the build work offline when the model is vendored and
# self-healing via download when it is not.
RUN mkdir -p /models \
    && (cp -n models/* /models/ 2>/dev/null || true) \
    && chmod +x ./scripts/downloadModel.sh \
    && MODELS_DIR=/models ./scripts/downloadModel.sh

# Build with CGO enabled (required for gocv). Output a single binary.
ENV CGO_ENABLED=1
RUN go build -o /usr/local/bin/worker ./cmd

# Control/signaling HTTP and the WebRTC UDP mux port.
EXPOSE 8090
EXPOSE 8091/udp

ENV WORKER_HTTP_PORT=8090 \
    WEBRTC_UDP_PORT=8091 \
    DETECTION_PROTOTXT=/models/MobileNetSSD_deploy.prototxt \
    DETECTION_MODEL=/models/MobileNetSSD_deploy.caffemodel

ENTRYPOINT ["/usr/local/bin/worker"]
