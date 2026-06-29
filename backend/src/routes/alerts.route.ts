import { Hono } from 'hono';
import { alertsController } from '../controllers/alerts.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { alertQuerySchema } from '../validations/alerts.validation';
import type { AppBindings } from '../types/context.types';

/** /api/v1/alerts (CONTRACTS §4.3). JWT-protected; results scoped to the user. */
export const alertsRoute = new Hono<AppBindings>();

alertsRoute.use('*', authMiddleware);
alertsRoute.get('/', validate('query', alertQuerySchema), alertsController.list);
