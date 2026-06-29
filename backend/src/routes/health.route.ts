import { Hono } from 'hono';
import { assertDatabaseConnection } from '../config/database';

/** /health (CONTRACTS §4.6). No auth — used by Docker healthchecks. */
export const healthRoute = new Hono();

healthRoute.get('/health', async (c) => {
  let db = 'down';
  try {
    await assertDatabaseConnection();
    db = 'up';
  } catch {
    db = 'down';
  }
  return c.json({ status: db === 'up' ? 'ok' : 'degraded', db }, db === 'up' ? 200 : 503);
});
