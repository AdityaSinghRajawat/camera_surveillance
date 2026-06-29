#!/bin/sh
# Publishes a looping pedestrian video to MediaMTX as an RTSP stream the worker
# can ingest. Re-encodes to H.264 baseline so the worker can WebRTC-passthrough
# (-c:v copy) without transcoding.
set -eu

RTSP_TARGET="${RTSP_TARGET:-rtsp://mediamtx:8554/stream}"
SAMPLE_URL="${SAMPLE_URL:-https://github.com/opencv/opencv_extra/raw/master/testdata/highgui/video/vtest.avi}"
SAMPLE_FILE="/app/sample.avi"

# A custom video can be mounted at /media/sample.* — prefer it if present.
for f in /media/sample.mp4 /media/sample.avi /media/sample.mov; do
  if [ -f "$f" ]; then SAMPLE_FILE="$f"; break; fi
done

if [ ! -f "$SAMPLE_FILE" ]; then
  echo "[teststream] downloading pedestrian sample video..."
  for i in 1 2 3 4 5; do
    if curl -fsSL "$SAMPLE_URL" -o "$SAMPLE_FILE"; then
      echo "[teststream] sample downloaded."
      break
    fi
    echo "[teststream] download attempt $i failed, retrying in 5s..."
    sleep 5
  done
fi

# Wait for MediaMTX to accept publishers.
echo "[teststream] waiting for MediaMTX..."
sleep 5

echo "[teststream] publishing $SAMPLE_FILE -> $RTSP_TARGET (looping)"
# -stream_loop -1 : loop forever; -re : real-time pacing; libx264 baseline for
# broad WebRTC compatibility; +cgop/keyint for frequent keyframes (faster join).
exec ffmpeg -hide_banner -loglevel warning \
  -re -stream_loop -1 -i "$SAMPLE_FILE" \
  -an \
  -c:v libx264 -preset veryfast -tune zerolatency -profile:v baseline -level 3.1 \
  -pix_fmt yuv420p -g 30 -keyint_min 30 -sc_threshold 0 -b:v 1200k \
  -f rtsp -rtsp_transport tcp "$RTSP_TARGET"
