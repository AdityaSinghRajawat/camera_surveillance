import type { Alert } from '../models';
import type { CanonicalAlert } from '../types/alert.types';

/**
 * THE canonical alert shape (CONTRACTS §2.2). Used identically by the REST list
 * response and the WebSocket `alert` payload — single serializer, no drift.
 */
export function serializeAlert(alert: Alert): CanonicalAlert {
  return {
    id: alert.id,
    cameraId: alert.cameraId,
    type: alert.type,
    label: alert.label,
    confidence: alert.confidence,
    detectionCount: alert.detectionCount,
    boundingBoxes: alert.boundingBoxes,
    frameTimestamp: alert.frameTimestamp.toISOString(),
    createdAt: alert.createdAt.toISOString(),
  };
}
