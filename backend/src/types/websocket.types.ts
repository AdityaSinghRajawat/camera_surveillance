import type { CanonicalAlert } from './alert.types';
import type { CameraStatus } from '../constants/cameraStatus.constants';

/** Per-camera live stats (CONTRACTS §3.3). */
export interface CameraStats {
  cameraId: string;
  fps: number;
  detectionsPerMinute: number;
  state: CameraStatus;
  timestamp: string; // ISO
}

/** Server → client envelope (CONTRACTS §3.1). */
export type WsServerMessage =
  | { type: 'alert'; cameraId: string; data: CanonicalAlert }
  | { type: 'stats'; cameraId: string; data: CameraStats }
  | { type: 'camera_state'; cameraId: string; data: { state: CameraStatus; message: string } }
  | { type: 'connected'; cameraId: null; data: { userId: string } }
  | { type: 'pong'; cameraId: null; data: Record<string, never> };

/** Client → server messages (CONTRACTS §3.2). */
export type WsClientMessage =
  | { type: 'subscribe'; cameraIds: string[] }
  | { type: 'unsubscribe'; cameraIds: string[] }
  | { type: 'ping' };
