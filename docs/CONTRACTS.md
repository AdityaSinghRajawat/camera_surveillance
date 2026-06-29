# CONTRACTS — Single Source of Truth

Every cross-service interface is pinned here. Worker, Backend, Frontend and Infra
must all agree with this document. Nothing here may drift per-service.

---

## 1. Services, ports, base paths

| Service   | Container name | Internal addr        | Host publish        | Notes |
|-----------|----------------|----------------------|---------------------|-------|
| postgres  | `skylark-db`   | `postgres:5432`      | `5432`              | db `skylark`, user `skylark`, pass `skylark` |
| backend   | `skylark-api`  | `backend:8080`       | `8080`              | REST under `/api/v1`, WS at `/ws` |
| worker    | `skylark-worker` | `worker:8090`      | `8090` + `8091/udp` | control+signaling HTTP on 8090, WebRTC UDP mux on 8091 |
| frontend  | `skylark-web`  | `frontend:80` (nginx)| `5173`              | SPA; proxies `/api` and `/ws` to backend |

REST base path: **`/api/v1`**. WebSocket path: **`/ws`** (same origin as backend).

---

## 2. Canonical Alert / Detection Event schema

ONE shape, used identically across worker → API → DB → WebSocket. Bounding boxes
are normalized to `[0,1]` relative to frame width/height (resolution independent).

### 2.1 Event as POSTed by worker → backend (no server-assigned fields)

```json
{
  "cameraId": "8b1c...-uuid",
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

### 2.2 Alert as stored in DB and returned by API / sent over WS (canonical, full)

```json
{
  "id": "uuid",
  "cameraId": "uuid",
  "type": "person_detected",
  "label": "person",
  "confidence": 0.92,
  "detectionCount": 2,
  "boundingBoxes": [ { "x": 0.1, "y": 0.2, "w": 0.3, "h": 0.4, "confidence": 0.92 } ],
  "frameTimestamp": "2026-06-29T12:00:00.000Z",
  "createdAt": "2026-06-29T12:00:00.050Z"
}
```

Field rules:
- `type`: enum, currently only `"person_detected"`.
- `confidence`: float 0..1, the max confidence among boxes.
- `detectionCount`: integer ≥ 1, number of persons in the frame.
- `boundingBoxes`: array, each `{x,y,w,h,confidence}` all floats; `x,y` top-left.
- `frameTimestamp`: ISO-8601 UTC, when the frame was captured by the worker.
- `createdAt`: ISO-8601 UTC, when the backend persisted it.

---

## 3. WebSocket protocol (backend ↔ frontend)

Connect: `GET /ws?token=<JWT>` (token in query string; browsers can't set WS headers).
Backend validates JWT, then only ever sends events for cameras the user owns.

### 3.1 Server → client messages (envelope)

```json
{ "type": "alert",        "cameraId": "uuid", "data": { <canonical Alert 2.2> } }
{ "type": "stats",        "cameraId": "uuid", "data": { <Stats 3.3> } }
{ "type": "camera_state", "cameraId": "uuid", "data": { "state": "live", "message": "" } }
{ "type": "connected",    "cameraId": null,   "data": { "userId": "uuid" } }
{ "type": "pong",         "cameraId": null,   "data": {} }
```

### 3.2 Client → server messages

```json
{ "type": "subscribe",   "cameraIds": ["uuid", "uuid"] }
{ "type": "unsubscribe", "cameraIds": ["uuid"] }
{ "type": "ping" }
```
If a client never subscribes, it receives events for ALL its owned cameras (default).
If it subscribes, it receives only the subscribed subset (still ownership-filtered).

### 3.3 Stats payload

```json
{ "cameraId": "uuid", "fps": 24.5, "detectionsPerMinute": 12, "state": "live", "timestamp": "ISO" }
```

### 3.4 Camera state enum (shared by stats.state, camera_state.state, frontend tile)

`"stopped" | "connecting" | "live" | "error"`

---

## 4. REST API (backend) — all under `/api/v1`

Auth: `Authorization: Bearer <JWT>` on every route except `/auth/*` and `/health`.
Errors use shape: `{ "error": { "code": "STRING_CODE", "message": "human readable", "details": {} } }`.
Success list responses: `{ "data": [...], "pagination": { "page", "pageSize", "total", "totalPages" } }`.
Success single responses: `{ "data": { ... } }`.

### 4.1 Auth
- `POST /auth/signup`  body `{ "username", "password" }` → `201 { data: { user, token } }`
- `POST /auth/login`   body `{ "username", "password" }` → `200 { data: { user, token } }`
- `GET  /auth/me`      (auth) → `200 { data: { user } }`

`user` shape: `{ "id", "username", "createdAt" }`. JWT payload: `{ "sub": userId, "username", "iat", "exp" }`.

### 4.2 Cameras (auth, scoped to req.user.id)
- `GET    /cameras`            → list (NOT paginated; small set) `{ data: [Camera] }`
- `POST   /cameras`            body `{ name, rtspUrl, location?, enabled? }` → `201 { data: Camera }`
- `GET    /cameras/:id`        → `{ data: Camera }`
- `PATCH  /cameras/:id`        body partial `{ name?, rtspUrl?, location?, enabled? }` → `{ data: Camera }`
- `DELETE /cameras/:id`        → `204`
- `POST   /cameras/:id/start`  → starts worker processing → `{ data: Camera }` (status=connecting)
- `POST   /cameras/:id/stop`   → stops worker processing → `{ data: Camera }` (status=stopped)

`Camera` shape:
```json
{
  "id": "uuid", "userId": "uuid", "name": "Front Door", "rtspUrl": "rtsp://...",
  "location": "Lobby", "enabled": true,
  "status": "stopped|connecting|live|error",
  "lastError": null,
  "createdAt": "ISO", "updatedAt": "ISO"
}
```

### 4.3 Alerts (auth, scoped via camera ownership)
- `GET /alerts` query params:
  - `cameraId` (uuid, optional)
  - `from` (ISO, optional)  `to` (ISO, optional)  — filter on `frameTimestamp`
  - `page` (default 1)  `pageSize` (default 20, max 100)
  - returns `{ data: [Alert], pagination }`, ordered `frameTimestamp DESC`.
- `GET /cameras/:id/alerts` — same, scoped to one camera (convenience).

### 4.4 WebRTC signaling (auth) — backend proxies to worker
- `POST /cameras/:id/stream/offer` body `{ "sdp": "...", "type": "offer" }`
  → backend verifies ownership, forwards to worker, returns `{ data: { "sdp": "...", "type": "answer" } }`.

### 4.5 Internal routes (worker → backend), guarded by `X-Worker-Key: <WORKER_API_KEY>` (NOT JWT)
- `POST /internal/alerts`  body `{ <Event 2.1> }` → `201 { data: Alert }`; also fans out over WS.
- `POST /internal/stats`   body `{ <Stats 3.3> }` → `204`; fans out over WS.
- `POST /internal/camera-state` body `{ cameraId, state, message? }` → `204`; updates Camera.status + fans out.

### 4.6 Health
- `GET /health` → `200 { status: "ok", db: "up" }` (no auth).

---

## 5. Backend → Worker control API (guarded by `X-Worker-Key`)

Worker listens on `worker:8090`.
- `POST /cameras/:id/start` body `{ "cameraId", "rtspUrl" }` → `200 { status: "starting" }`
- `POST /cameras/:id/stop`  body `{ "cameraId" }`           → `200 { status: "stopped" }`
- `POST /cameras/:id/webrtc/offer` body `{ "sdp", "type": "offer" }` → `200 { "sdp", "type": "answer" }`
- `GET  /health` → `200 { status: "ok", cameras: <n> }`

Worker → Backend uses base URL `BACKEND_INTERNAL_URL` (e.g. `http://backend:8080/api/v1`)
and header `X-Worker-Key: <WORKER_API_KEY>`.

---

## 6. Detection model

**MobileNet-SSD (Caffe), VOC-trained**, run via OpenCV DNN through GoCV.
- Files: `MobileNetSSD_deploy.prototxt`, `MobileNetSSD_deploy.caffemodel` (~23 MB).
- Person class id = `15` in the 21-class VOC label set.
- Confidence threshold default `0.5` (env `DETECTION_CONFIDENCE`).
- Input: 300×300, scale `0.007843`, mean `127.5`, swapRB false.
- Output blob `[1,1,N,7]`: `[_, classId, confidence, x1, y1, x2, y2]` (already normalized 0..1).

Rationale (for README): tiny, CPU-real-time, self-contained in the gocv OpenCV image,
single `person` class trivially extracted, no GPU or external inference server needed →
satisfies "in-worker detection model directly" and scales horizontally per camera.

---

## 7. Shared environment variables

### Backend
```
NODE_ENV=production
PORT=8080
DATABASE_URL=postgres://skylark:skylark@postgres:5432/skylark
JWT_SECRET=change-me-in-prod
JWT_EXPIRES_IN=7d
WORKER_API_KEY=worker-shared-secret
WORKER_CONTROL_URL=http://worker:8090
CORS_ORIGIN=http://localhost:5173
LOG_LEVEL=info
```

### Worker
```
WORKER_HTTP_PORT=8090
WEBRTC_UDP_PORT=8091
WEBRTC_PUBLIC_IP=127.0.0.1        # NAT 1-to-1 host candidate for browser reachability
BACKEND_INTERNAL_URL=http://backend:8080/api/v1
WORKER_API_KEY=worker-shared-secret
DETECTION_PROTOTXT=/models/MobileNetSSD_deploy.prototxt
DETECTION_MODEL=/models/MobileNetSSD_deploy.caffemodel
DETECTION_CONFIDENCE=0.5
DETECTION_INTERVAL_MS=200          # run detection every N ms (throttle, not every frame)
ALERT_DEDUP_WINDOW_MS=5000         # suppress duplicate person alerts within window
STATS_INTERVAL_MS=2000
LOG_LEVEL=info
```

### Frontend (build-time, Vite)
```
VITE_API_BASE_URL=/api/v1
VITE_WS_URL=/ws
```
(Frontend talks to backend through nginx reverse proxy; same origin, no CORS in prod.)

---

## 8. Database tables (Sequelize, snake_case columns, plural table names)

- `users`:   id (uuid pk), username (unique, citext/string), password_hash, created_at, updated_at
- `cameras`: id (uuid pk), user_id (fk→users, on delete cascade), name, rtsp_url, location (nullable),
             enabled (bool default true), status (enum default 'stopped'), last_error (nullable),
             created_at, updated_at
- `alerts`:  id (uuid pk), camera_id (fk→cameras, on delete cascade), type (enum), label,
             confidence (float), detection_count (int), bounding_boxes (jsonb),
             frame_timestamp (timestamptz, indexed), created_at, updated_at
  Indexes: `(camera_id, frame_timestamp DESC)` for filtered pagination.

Models expose camelCase attributes mapped to snake_case columns via `field:` / `underscored: true`.

Seed user: `admin` / `admin123` plus one demo camera using a public RTSP test stream.
