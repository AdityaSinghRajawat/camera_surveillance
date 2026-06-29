import { alertsRepository } from '../repositories/alerts.repository';
import { camerasRepository } from '../repositories/cameras.repository';
import { serializeAlert } from '../serializers/alerts.serializer';
import { broadcaster } from '../websocket/broadcaster';
import { buildPaginationMeta, toLimitOffset, type PaginationMeta } from '../helpers/pagination.helper';
import { AppError } from '../utils/appError.util';
import { logger } from '../utils/logger.util';
import type { CanonicalAlert, DetectionEventInput } from '../types/alert.types';
import type { CameraStats } from '../types/websocket.types';
import type { CameraStatus } from '../constants/cameraStatus.constants';
import type { AlertQueryInput } from '../validations/alerts.validation';

export interface AlertListResult {
  data: CanonicalAlert[];
  pagination: PaginationMeta;
}

/** Business logic for alert ingestion + retrieval + realtime fan-out. */
export const alertsService = {
  /**
   * Ingest a detection event from the worker (CONTRACTS §4.5).
   * Durability first: persist, THEN broadcast. A broadcast failure never loses
   * the stored alert.
   */
  async ingest(event: DetectionEventInput): Promise<CanonicalAlert> {
    const alert = await alertsRepository.create(event);
    const serialized = serializeAlert(alert);
    try {
      await broadcaster.alert(serialized);
    } catch (err) {
      logger.warn('alert broadcast failed (already persisted)', { id: serialized.id, err: String(err) });
    }
    return serialized;
  },

  /** Fan out ephemeral per-camera stats (not persisted). */
  async ingestStats(stats: CameraStats): Promise<void> {
    await broadcaster.stats(stats);
  },

  /** Update camera status from a worker state event + fan out (CONTRACTS §4.5). */
  async ingestCameraState(cameraId: string, state: CameraStatus, message: string): Promise<void> {
    const camera = await camerasRepository.findById(cameraId);
    if (camera) {
      await camerasRepository.setStatus(camera, state, state === 'error' ? message : null);
    }
    await broadcaster.cameraState(cameraId, state, message);
  },

  /** List alerts for the user with filtering + pagination (CONTRACTS §4.3). */
  async list(userId: string, query: AlertQueryInput): Promise<AlertListResult> {
    const { limit, offset } = toLimitOffset(query.page, query.pageSize);
    const { rows, total } = await alertsRepository.query({
      userId,
      cameraId: query.cameraId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit,
      offset,
    });
    return {
      data: rows.map(serializeAlert),
      pagination: buildPaginationMeta(query.page, query.pageSize, total),
    };
  },

  /** List alerts for a single owned camera (CONTRACTS §4.3 convenience route). */
  async listForCamera(cameraId: string, userId: string, query: AlertQueryInput): Promise<AlertListResult> {
    const camera = await camerasRepository.findByIdForUser(cameraId, userId);
    if (!camera) throw AppError.notFound('Camera not found');
    return this.list(userId, { ...query, cameraId });
  },
};
