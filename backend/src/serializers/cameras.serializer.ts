import type { Camera } from '../models';
import type { CameraStatus } from '../constants/cameraStatus.constants';

export interface SerializedCamera {
  id: string;
  userId: string;
  name: string;
  rtspUrl: string;
  location: string | null;
  enabled: boolean;
  status: CameraStatus;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Canonical Camera shape — CONTRACTS §4.2. */
export function serializeCamera(camera: Camera): SerializedCamera {
  return {
    id: camera.id,
    userId: camera.userId,
    name: camera.name,
    rtspUrl: camera.rtspUrl,
    location: camera.location ?? null,
    enabled: camera.enabled,
    status: camera.status,
    lastError: camera.lastError ?? null,
    createdAt: camera.createdAt.toISOString(),
    updatedAt: camera.updatedAt.toISOString(),
  };
}
