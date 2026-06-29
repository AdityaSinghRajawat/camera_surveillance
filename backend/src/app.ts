import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRoute } from './routes/auth.route';
import { camerasRoute } from './routes/cameras.route';
import { alertsRoute } from './routes/alerts.route';
import { internalRoute } from './routes/internal.route';
import { healthRoute } from './routes/health.route';
import { swaggerRoute } from './swagger';
import { wsUpgrade } from './websocket/wsHandler';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import { getEnv } from './config/env';
import type { AppBindings } from './types/context.types';

/**
 * Hono app assembly ONLY. No business logic here — just middleware wiring, route
 * mounting, the WebSocket upgrade endpoint, error handlers and API docs.
 */
export function createApp(): Hono<AppBindings> {
  const env = getEnv();
  const app = new Hono<AppBindings>();

  // CORS for the REST API (dev uses a Vite proxy; prod is same-origin via nginx).
  app.use(
    '/api/*',
    cors({
      origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-Worker-Key'],
      credentials: true,
    }),
  );

  // Health + realtime.
  app.route('/', healthRoute);
  app.get('/ws', wsUpgrade);

  // REST API (v1).
  app.route('/api/v1/auth', authRoute);
  app.route('/api/v1/cameras', camerasRoute);
  app.route('/api/v1/alerts', alertsRoute);
  app.route('/api/v1/internal', internalRoute);

  // API docs (Swagger UI + OpenAPI JSON).
  app.route('/api/v1', swaggerRoute);

  app.notFound(notFoundHandler);
  app.onError(errorHandler);

  return app;
}
