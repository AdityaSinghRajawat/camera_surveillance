import { Hono } from 'hono';
import { internalController } from '../controllers/internal.controller';
import { workerAuthMiddleware } from '../middlewares/workerAuth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  detectionEventSchema,
  statsEventSchema,
  cameraStateEventSchema,
} from '../validations/alerts.validation';

/** /api/v1/internal (CONTRACTS §4.5). Guarded by X-Worker-Key, not JWT. */
export const internalRoute = new Hono();

internalRoute.use('*', workerAuthMiddleware);

internalRoute.post('/alerts', validate('json', detectionEventSchema), internalController.ingestAlert);
internalRoute.post('/stats', validate('json', statsEventSchema), internalController.ingestStats);
internalRoute.post(
  '/camera-state',
  validate('json', cameraStateEventSchema),
  internalController.ingestCameraState,
);
