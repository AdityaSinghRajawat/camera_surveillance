import { connectionRegistry } from './connectionRegistry';
import { camerasRepository } from '../repositories/cameras.repository';
import type { CanonicalAlert } from '../types/alert.types';
import type { CameraStats } from '../types/websocket.types';
import type { CameraStatus } from '../constants/cameraStatus.constants';
import { WS_SERVER_MSG } from '../constants/websocket.constants';
import { logger } from '../utils/logger.util';

/**
 * Per-camera broadcast: resolves the owning user for a camera, then fans the
 * canonical envelope (CONTRACTS §3.1) out to that user's matching connections.
 * Owner lookups are cached to keep the hot path (alerts/stats) off the DB.
 */
const ownerCache = new Map<string, string>();

async function resolveOwner(cameraId: string): Promise<string | null> {
  const cached = ownerCache.get(cameraId);
  if (cached) return cached;
  const userId = await camerasRepository.getOwnerUserId(cameraId);
  if (userId) ownerCache.set(cameraId, userId);
  return userId;
}

/** Invalidate cache when a camera is deleted/reassigned. */
export function invalidateOwner(cameraId: string): void {
  ownerCache.delete(cameraId);
}

export const broadcaster = {
  async alert(alert: CanonicalAlert): Promise<void> {
    const userId = await resolveOwner(alert.cameraId);
    if (!userId) return;
    connectionRegistry.deliverToUserForCamera(userId, alert.cameraId, {
      type: WS_SERVER_MSG.ALERT,
      cameraId: alert.cameraId,
      data: alert,
    });
  },

  async stats(stats: CameraStats): Promise<void> {
    const userId = await resolveOwner(stats.cameraId);
    if (!userId) return;
    connectionRegistry.deliverToUserForCamera(userId, stats.cameraId, {
      type: WS_SERVER_MSG.STATS,
      cameraId: stats.cameraId,
      data: stats,
    });
  },

  async cameraState(cameraId: string, state: CameraStatus, message: string): Promise<void> {
    const userId = await resolveOwner(cameraId);
    if (!userId) {
      logger.debug('camera_state broadcast skipped, no owner', { cameraId });
      return;
    }
    connectionRegistry.deliverToUserForCamera(userId, cameraId, {
      type: WS_SERVER_MSG.CAMERA_STATE,
      cameraId,
      data: { state, message },
    });
  },
};
