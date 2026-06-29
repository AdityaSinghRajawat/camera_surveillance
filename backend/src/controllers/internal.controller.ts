import type { Context } from 'hono';
import { alertsService } from '../services/alerts.service';
import { getValidated } from '../utils/validated.util';
import type { DetectionEventInput } from '../types/alert.types';
import type { CameraStats } from '../types/websocket.types';
import type { CameraStatus } from '../constants/cameraStatus.constants';

/** Worker → backend ingestion endpoints (CONTRACTS §4.5). Request/response only. */
export const internalController = {
  async ingestAlert(c: Context) {
    const event = getValidated<DetectionEventInput>(c, 'json');
    const alert = await alertsService.ingest(event);
    return c.json({ data: alert }, 201);
  },

  async ingestStats(c: Context) {
    const stats = getValidated<CameraStats>(c, 'json');
    await alertsService.ingestStats(stats);
    return c.body(null, 204);
  },

  async ingestCameraState(c: Context) {
    const body = getValidated<{ cameraId: string; state: CameraStatus; message?: string }>(c, 'json');
    await alertsService.ingestCameraState(body.cameraId, body.state, body.message ?? '');
    return c.body(null, 204);
  },
};
