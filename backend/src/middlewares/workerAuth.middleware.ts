import { createMiddleware } from 'hono/factory';
import { getEnv } from '../config/env';
import { AppError } from '../utils/appError.util';

/**
 * Guards internal routes (worker → backend, CONTRACTS §4.5). Uses the shared
 * X-Worker-Key secret rather than a user JWT — these calls are service-to-service.
 */
export const workerAuthMiddleware = createMiddleware(async (c, next) => {
  const key = c.req.header('X-Worker-Key');
  if (!key || key !== getEnv().WORKER_API_KEY) {
    throw AppError.unauthorized('Invalid worker key');
  }
  await next();
});
