# Skylark — Real-Time Camera Surveillance Dashboard with Person Detection (WebRTC)

A small but production-shaped Video Management System. A user registers cameras by
RTSP URL, watches the live feed in the browser over **WebRTC**, and receives
**real-time alerts** when a person appears in frame. Person detection runs inside a
Go worker using an open-source model; alerts and per-camera stats stream to the
browser over **WebSocket**.

The entire system — frontend, backend, worker, Postgres, and a self-contained RTSP
test source — comes up with a single command:

```bash
cp .env.example .env        # sane dev defaults already filled in
docker compose up --build
```

Then open **http://localhost:5173** and log in with the seeded account
**`admin` / `admin123`**. A demo camera is pre-seeded pointing at the bundled
pedestrian RTSP stream — hit **Start** on its tile to see live video + person alerts.

---

## Table of contents
1. [Architecture](#architecture)
2. [Service responsibilities](#service-responsibilities)
3. [Design decisions](#design-decisions)
4. [Detection model — what & why](#detection-model--what--why)
5. [The canonical event format](#the-canonical-event-format)
6. [Data flow walkthroughs](#data-flow-walkthroughs)
7. [How to run](#how-to-run)
8. [API surface](#api-surface)
9. [Project layout](#project-layout)
10. [Production-grade properties](#production-grade-properties)
11. [Future improvements](#future-improvements)

---

## Architecture

```
                          ┌──────────────────────────────────────────────┐
                          │                  Browser (SPA)                 │
                          │  React + TS — Login, Camera CRUD, Dashboard    │
                          └───┬───────────────┬───────────────────┬───────┘
                  REST/JWT    │     WS /ws     │   WebRTC media     │
                  (/api/v1)   │  (alerts/stats)│   (UDP, H.264)     │
                              ▼               ▼                     ▼
       ┌──────────────────────────────────────────┐      ┌──────────────────────┐
       │            Backend  (Bun + Hono)          │      │   Worker  (Go)        │
       │  auth · camera CRUD · alerts (filter/page)│◀────▶│  control + signaling  │
       │  WS hub (per-user fan-out) · WebRTC proxy │ HTTP │  RTSP ingest (FFmpeg) │
       │  internal ingest (X-Worker-Key)           │ +key │  MobileNet-SSD detect │
       └───────────────┬───────────────────────────┘      │  pion WebRTC re-stream│
                       │ Sequelize                          └──────────┬───────────┘
                       ▼                                                │ RTSP
              ┌─────────────────┐                              ┌────────▼─────────┐
              │   PostgreSQL    │                              │  MediaMTX + ffmpeg│
              │ users/cameras/  │                              │  (pedestrian loop)│
              │     alerts      │                              │   demo RTSP src   │
              └─────────────────┘                              └──────────────────┘
```

Three services + Postgres, exactly as the brief specifies, plus a bundled RTSP
source so the demo is reproducible without an external camera.

- **WebRTC media** flows **directly** worker → browser (low latency, peer-to-peer
  media). Only the *signaling* (SDP offer/answer) is proxied through the backend so
  it can be authenticated and ownership-checked.
- **Control & ingest** (start/stop, alerts, stats, camera-state) flow over HTTP
  between backend and worker, authenticated with a shared `X-Worker-Key`.
- **Realtime to the browser** (alerts + stats) flows over a single backend
  WebSocket, fanned out per authenticated user.

---

## Service responsibilities

| Service | Stack | Owns |
|---|---|---|
| **Frontend** | React + TypeScript + Vite (nginx in prod) | Auth UI, camera CRUD, dashboard grid, WebRTC playback, WS subscription, live tile state |
| **Backend** | Bun + Hono + TypeScript + Sequelize + Postgres | JWT auth, camera CRUD (owner-scoped), alert storage + filtering + pagination, WS hub, WebRTC signaling proxy, worker control orchestration |
| **Worker** | Go + pion/webrtc + GoCV (OpenCV) + FFmpeg | RTSP ingestion, per-camera isolated processing, MobileNet-SSD person detection, WebRTC re-streaming, posting events/stats back to the API |
| **Postgres** | Postgres 16 | `users`, `cameras`, `alerts` |
| **MediaMTX + teststream** | bluenviron/mediamtx + ffmpeg | Self-contained pedestrian RTSP source for the demo |

---

## Design decisions

These were decided **once, up front** and pinned in [`docs/CONTRACTS.md`](docs/CONTRACTS.md),
which is the single source of truth every service is built against.

### 1. One canonical event/alert schema, everywhere
The exact same shape is used by the worker (producer), the API (validator/store),
the DB (`alerts` row), and the WebSocket payload. Bounding boxes are **normalized to
`[0,1]`** so they're resolution-independent and render correctly on any tile size.
See [The canonical event format](#the-canonical-event-format).

### 2. Detection model: MobileNet-SSD (Caffe) via OpenCV DNN
See [the next section](#detection-model--what--why) for the full rationale.

### 3. WebRTC signaling via the backend, media direct from the worker
The browser builds an SDP offer and POSTs it to
`POST /api/v1/cameras/:id/stream/offer` (JWT-protected, ownership-checked). The
backend forwards it to the worker, which creates a `pion` `PeerConnection`, attaches
the camera's shared H.264 track, and returns the answer. **Media then flows directly**
worker→browser over a fixed UDP port. This keeps signaling authenticated and
single-origin while keeping media off the backend's hot path. The worker uses a UDP
**mux** on one port plus `SetNAT1To1IPs` so a single published port works through
Docker's NAT.

### 4. Per-camera process isolation in the worker
Each camera is a `Camera` struct with its **own** `context.Context` + cancel func and
its own goroutines (RTSP read, detection, stats, WebRTC). A `CameraManager` holds a
`map[id]*Camera` behind a mutex. Every camera goroutine is wrapped in a
`recover()`-guarded supervisor that logs, transitions the camera to `error`, and
restarts with exponential backoff. **One camera failing, erroring, or being stopped
never touches the others and never crashes the worker.** Adding a camera is just
another map entry — no architectural change, which is the scalability property the
brief asks for.

### 5. WebSocket fan-out scoped per user
Clients connect to `/ws?token=<JWT>` (browsers can't set WS headers, so the JWT goes
in the query string and is validated on upgrade). The hub keeps
`userId → Set<connection>` and a cached `cameraId → ownerUserId` map. When an alert,
stat, or state change arrives, it's fanned out **only** to the owning user's sockets,
further filtered by any explicit `subscribe` set. This enforces the same ownership
boundary as REST, over realtime.

### 6. Validation: Zod + `@hono/zod-validator`
Zod is the de-facto standard for Hono (first-party `@hono/zod-validator` middleware),
gives compile-time type inference from the same schema used at runtime, and keeps a
single declaration for validation + TypeScript types. Chosen over Joi/Yup
(no type inference) and TypeBox (less ergonomic) for exactly that
single-source-of-truth property.

### 7. No data loss on ingestion
The worker never blocks its detection loop on a slow network call: events are pushed
to a buffered channel and drained by a publisher goroutine that retries with backoff.
On the backend, `/internal/alerts` **persists first, then fans out** — a WebSocket
fan-out failure can never lose a stored alert.

---

## Detection model — what & why

**Model: MobileNet-SSD (Caffe, VOC-trained), run through OpenCV's DNN module via GoCV.**

Files: `MobileNetSSD_deploy.prototxt` + `MobileNetSSD_deploy.caffemodel` (~23 MB),
downloaded into the worker image at build time. Inference config: 300×300 input,
scale `0.007843`, mean `127.5`; the `person` class is id **15** in the 21-class VOC
label set; default confidence threshold `0.5` (`DETECTION_CONFIDENCE`).

**Why this model:**
- **CPU real-time, no GPU.** MobileNet-SSD is designed for edge/mobile inference and
  runs comfortably in real time on a CPU, so the demo works on any laptop with no
  CUDA/accelerator and no external inference server.
- **Truly in-worker, "directly".** The brief asks the worker to *"run an open source
  person detection model directly."* OpenCV's DNN module loads the weights and runs
  inference **inside the Go process** — there is no Triton/Python sidecar to operate.
- **Self-contained image.** The GoCV base image already bundles OpenCV; adding FFmpeg
  gives RTSP decode in the same container. One image, no model-server dependency.
- **Trivial person extraction.** The SSD output blob `[1,1,N,7]` yields
  `[_, classId, confidence, x1, y1, x2, y2]` with coordinates **already normalized**,
  so producing the canonical normalized bounding boxes is a direct mapping.
- **Horizontally scalable.** Detection is per-camera and cheap, so scaling to more
  cameras is "run more worker replicas," not "buy a bigger GPU."

A heavier model (YOLOv8) would raise accuracy but needs ONNX runtime/GPU for
real-time and complicates the build; MobileNet-SSD is the right fit for a
multi-camera, CPU-only, single-binary worker. Swapping models is isolated to
`internal/detection/detector.go` behind a single `Detector` interface.

---

## The canonical event format

The exact JSON below is what the worker emits, what the API validates and stores,
what a DB `alerts` row contains, and what the WebSocket delivers — **identical
everywhere**.

**Worker → `POST /api/v1/internal/alerts`** (server assigns `id`/`createdAt`):

```json
{
  "cameraId": "8b1c2d3e-...-uuid",
  "type": "person_detected",
  "label": "person",
  "confidence": 0.92,
  "detectionCount": 2,
  "boundingBoxes": [
    { "x": 0.10, "y": 0.20, "w": 0.30, "h": 0.40, "confidence": 0.92 },
    { "x": 0.55, "y": 0.30, "w": 0.20, "h": 0.50, "confidence": 0.81 }
  ],
  "frameTimestamp": "2026-06-29T12:00:00.000Z"
}
```

**Canonical Alert** (DB row, `GET /alerts` item, and WS `alert.data`):

```json
{
  "id": "uuid",
  "cameraId": "uuid",
  "type": "person_detected",
  "label": "person",
  "confidence": 0.92,
  "detectionCount": 2,
  "boundingBoxes": [{ "x": 0.1, "y": 0.2, "w": 0.3, "h": 0.4, "confidence": 0.92 }],
  "frameTimestamp": "2026-06-29T12:00:00.000Z",
  "createdAt": "2026-06-29T12:00:00.050Z"
}
```

- `confidence` — max box confidence, `0..1`
- `detectionCount` — number of persons in the frame, integer ≥ 1
- `boundingBoxes[]` — `{x,y,w,h,confidence}`, all normalized `0..1`, `x,y` = top-left
- `frameTimestamp` — when the frame was captured (worker clock, UTC ISO-8601)
- `createdAt` — when the backend persisted it (UTC ISO-8601)

**WebSocket envelope** (server → client):

```json
{ "type": "alert",        "cameraId": "uuid", "data": { ...canonical Alert... } }
{ "type": "stats",        "cameraId": "uuid", "data": { "cameraId":"uuid","fps":24.5,"detectionsPerMinute":12,"state":"live","timestamp":"ISO" } }
{ "type": "camera_state", "cameraId": "uuid", "data": { "state": "live", "message": "" } }
```

Camera/stream state is a shared enum everywhere:
`"stopped" | "connecting" | "live" | "error"`.

Full protocol details (client→server `subscribe`/`unsubscribe`/`ping`, all REST
shapes, headers, env) live in [`docs/CONTRACTS.md`](docs/CONTRACTS.md).

---

## Data flow walkthroughs

**Starting a camera**
1. Browser → `POST /api/v1/cameras/:id/start` (JWT).
2. Backend verifies ownership, calls worker `POST /cameras/:id/start {rtspUrl}` with
   `X-Worker-Key`, sets `status=connecting`.
3. Worker `CameraManager` spawns an isolated `Camera`: FFmpeg opens the RTSP stream,
   the detection loop and WebRTC track start, and it POSTs `camera-state: live`.
4. Backend persists the state and fans it out over WS; the tile flips to **live**.

**A person is detected**
1. Worker detection loop runs MobileNet-SSD on a throttled frame, finds a person.
2. After dedup/rate-limit, it builds the canonical event and enqueues it; the
   publisher POSTs `POST /api/v1/internal/alerts` (`X-Worker-Key`), retrying on
   failure.
3. Backend validates, **persists** the `Alert`, then fans it out over WS to the
   owner's sockets.
4. The tile's alert feed updates instantly; the stat ticker shows
   detections/minute climbing.

**Watching the live feed**
1. The tile's `useWebRTC` creates a recv-only `RTCPeerConnection`, makes an offer,
   POSTs it to `POST /api/v1/cameras/:id/stream/offer`.
2. Backend forwards to the worker, which attaches the camera's shared H.264 track and
   answers. Media then flows **directly** worker→browser over the UDP mux port.

---

## How to run

### Prerequisites
- Docker + Docker Compose v2. That's it.

### Up
```bash
cp .env.example .env
docker compose up --build      # or: make up
```
First build downloads the GoCV/OpenCV layers and the detection model (a few minutes
once; cached after). When healthy:

- **Frontend:** http://localhost:5173  (login `admin` / `admin123`)
- **Backend API + Swagger:** http://localhost:8080/api/v1  ·  docs at http://localhost:8080/docs
- **Worker control/health:** http://localhost:8090/health

The seeded **demo camera** points at the bundled pedestrian RTSP stream. Press
**Start** on its tile → it goes `connecting → live`, video appears, and person
alerts begin streaming in.

### Add your own camera
Use the **+ Add Camera** button with any reachable RTSP URL (e.g. a local `mediamtx`
or `ffmpeg` loop, or a public test stream). Then **Start** it.

### Use your own demo video
Drop a file at `infra/teststream/` and mount it, or set `SAMPLE_URL` on the
`teststream` service in `docker-compose.yml`.

### Common commands
```bash
make logs           # tail everything
make worker-logs    # just the worker
make down           # stop
make clean          # stop + wipe the database volume
```

### Running services individually (dev)
- Backend: `cd backend && bun install && bun run dev` (needs Postgres + env)
- Frontend: `cd frontend && npm install && npm run dev` (proxies to `:8080`)
- Worker: `cd worker && go build ./... && ./...` (needs OpenCV + FFmpeg locally)

---

## API surface

All under `/api/v1`. Full request/response shapes in `docs/CONTRACTS.md`; live Swagger
UI at `/docs`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/signup` | – | create account, returns JWT |
| POST | `/auth/login` | – | login, returns JWT |
| GET | `/auth/me` | JWT | current user |
| GET | `/cameras` | JWT | list own cameras |
| POST | `/cameras` | JWT | create camera |
| GET/PATCH/DELETE | `/cameras/:id` | JWT | read / update / delete (owner-scoped) |
| POST | `/cameras/:id/start` | JWT | start worker processing |
| POST | `/cameras/:id/stop` | JWT | stop worker processing |
| POST | `/cameras/:id/stream/offer` | JWT | WebRTC signaling (→ answer) |
| GET | `/alerts` | JWT | alerts with `cameraId`/`from`/`to` filters + pagination |
| GET | `/cameras/:id/alerts` | JWT | alerts for one camera |
| POST | `/internal/alerts` | Worker key | ingest detection event |
| POST | `/internal/stats` | Worker key | ingest per-camera stats |
| POST | `/internal/camera-state` | Worker key | ingest state transition |
| GET | `/health` | – | liveness + DB check |

---

## Project layout

```
.
├── docker-compose.yml          # one-command stack
├── docs/CONTRACTS.md           # the single source of truth (all interfaces)
├── backend/                    # Bun + Hono + Sequelize  (route→controller→service→repository)
├── worker/                     # Go: cmd/ + internal/{camera,rtsp,detection,webrtc,eventbus,...}
├── frontend/                   # React: pages/components/hooks/services/context
└── infra/teststream/           # bundled pedestrian RTSP source
```
Each service's own README/structure follows the naming conventions in the brief; see
the per-folder justifications in `docs/CONTRACTS.md` and each service directory.

---

## Production-grade properties

- **Robust** — errors are handled at every layer; one camera/stream failing is
  isolated and auto-recovers without affecting others or the worker process.
- **Scalable** — adding cameras is a map entry; the worker is replica-friendly and
  detection is per-camera and CPU-cheap. No architectural change to add load.
- **Reliable** — one canonical event schema end-to-end; ingestion persists before
  fan-out (no alert loss); WebSocket and WebRTC both auto-reconnect with backoff.
- **Secure** — JWT enforced on all camera/alert routes; every camera and alert query
  is scoped to the owning user; worker↔backend traffic is gated by a shared key.
- **Consistent design** — single responsibility per layer, dependencies flow
  downward only (route→controller→service→repository), no business logic outside
  services, no magic values (typed constants), naming conventions applied throughout.

---

## Future improvements

- **Message queue** (NATS/Redis Streams/Kafka) for camera commands and detection
  events, decoupling worker and API for burst tolerance and at-least-once delivery
  (the publisher/ingest seam is already a clean insertion point).
- **Horizontal worker sharding** — a coordinator assigns cameras to worker replicas
  by consistent hashing; the manager abstraction already supports it.
- **TURN server** for WebRTC across restrictive NATs (currently STUN + host
  candidates, ideal for LAN/demo).
- **Model upgrades** — pluggable `Detector` interface allows YOLOv8/RT-DETR on GPU
  nodes; add tracking (ByteTrack) to dedupe the same person across frames.
- **Recording & clip storage** (object storage) keyed to alerts.
- **Observability** — Prometheus metrics, structured tracing across the signaling and
  ingest paths.
- **Kubernetes** manifests + HPA on the worker; the stateless API scales trivially.
- **Alert dedup/rate-limiting** is implemented in-worker; could move to a shared
  store for cross-replica dedup.
