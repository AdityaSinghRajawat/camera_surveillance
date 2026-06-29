// Shared TypeScript types mirroring docs/CONTRACTS.md exactly.

// ---- Camera state enum (CONTRACTS §3.4) ----
export type CameraState = 'stopped' | 'connecting' | 'live' | 'error';

// ---- User (CONTRACTS §4.1) ----
export interface User {
  id: string;
  username: string;
  createdAt: string;
}

export interface AuthResult {
  user: User;
  token: string;
}

// ---- Camera (CONTRACTS §4.2) ----
export interface Camera {
  id: string;
  userId: string;
  name: string;
  rtspUrl: string;
  location: string | null;
  enabled: boolean;
  status: CameraState;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

// Payload for create (POST /cameras).
export interface CameraCreateInput {
  name: string;
  rtspUrl: string;
  location?: string;
  enabled?: boolean;
}

// Payload for update (PATCH /cameras/:id).
export interface CameraUpdateInput {
  name?: string;
  rtspUrl?: string;
  location?: string;
  enabled?: boolean;
}

// ---- Alert / Detection (CONTRACTS §2.2) ----
export type AlertType = 'person_detected';

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
  confidence: number;
}

export interface Alert {
  id: string;
  cameraId: string;
  type: AlertType;
  label: string;
  confidence: number;
  detectionCount: number;
  boundingBoxes: BoundingBox[];
  frameTimestamp: string;
  createdAt: string;
}

// ---- Stats (CONTRACTS §3.3) ----
export interface Stats {
  cameraId: string;
  fps: number;
  detectionsPerMinute: number;
  state: CameraState;
  timestamp: string;
}

// ---- WebRTC signaling (CONTRACTS §4.4) ----
export interface SdpOffer {
  sdp: string;
  type: 'offer';
}

export interface SdpAnswer {
  sdp: string;
  type: 'answer';
}

// ---- REST envelopes (CONTRACTS §4) ----
export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiListResponse<T> {
  data: T[];
  pagination: Pagination;
}

export interface ApiSingleResponse<T> {
  data: T;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// ---- WebSocket protocol (CONTRACTS §3) ----
export type CameraStateData = {
  state: CameraState;
  message: string;
};

export type ConnectedData = {
  userId: string;
};

// Server -> client message envelope (discriminated union on `type`).
export type ServerMessage =
  | { type: 'alert'; cameraId: string; data: Alert }
  | { type: 'stats'; cameraId: string; data: Stats }
  | { type: 'camera_state'; cameraId: string; data: CameraStateData }
  | { type: 'connected'; cameraId: null; data: ConnectedData }
  | { type: 'pong'; cameraId: null; data: Record<string, never> };

export type ServerMessageType = ServerMessage['type'];

// Client -> server messages.
export type ClientMessage =
  | { type: 'subscribe'; cameraIds: string[] }
  | { type: 'unsubscribe'; cameraIds: string[] }
  | { type: 'ping' };
