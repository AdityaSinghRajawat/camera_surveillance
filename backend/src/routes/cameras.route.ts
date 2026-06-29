import { Hono } from 'hono';
import { camerasController } from '../controllers/cameras.controller';
import { alertsController } from '../controllers/alerts.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createCameraSchema,
  updateCameraSchema,
  cameraIdParamSchema,
} from '../validations/cameras.validation';
import { alertQuerySchema, webrtcOfferSchema } from '../validations/alerts.validation';
import type { AppBindings } from '../types/context.types';

/** /api/v1/cameras (CONTRACTS §4.2, §4.3 convenience, §4.4). All routes JWT-protected. */
export const camerasRoute = new Hono<AppBindings>();

camerasRoute.use('*', authMiddleware);

camerasRoute.get('/', camerasController.list);
camerasRoute.post('/', validate('json', createCameraSchema), camerasController.create);

camerasRoute.get('/:id', validate('param', cameraIdParamSchema), camerasController.get);
camerasRoute.patch(
  '/:id',
  validate('param', cameraIdParamSchema),
  validate('json', updateCameraSchema),
  camerasController.update,
);
camerasRoute.delete('/:id', validate('param', cameraIdParamSchema), camerasController.remove);

camerasRoute.post('/:id/start', validate('param', cameraIdParamSchema), camerasController.start);
camerasRoute.post('/:id/stop', validate('param', cameraIdParamSchema), camerasController.stop);

camerasRoute.post(
  '/:id/stream/offer',
  validate('param', cameraIdParamSchema),
  validate('json', webrtcOfferSchema),
  camerasController.streamOffer,
);

// Convenience: alerts scoped to one owned camera.
camerasRoute.get(
  '/:id/alerts',
  validate('param', cameraIdParamSchema),
  validate('query', alertQuerySchema),
  alertsController.listForCamera,
);
