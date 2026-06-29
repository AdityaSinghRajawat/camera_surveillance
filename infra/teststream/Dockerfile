# Bundled RTSP test source: loops a real pedestrian video into MediaMTX over RTSP.
# Uses OpenCV's classic `vtest.avi` (people walking) so MobileNet-SSD has actual
# persons to detect — no real camera or external public stream required.
FROM alpine:3.20

RUN apk add --no-cache ffmpeg curl

WORKDIR /app
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
