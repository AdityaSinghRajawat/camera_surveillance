import { createApp } from './app';
import { getEnv } from './config/env';
import { assertDatabaseConnection, closeDatabase } from './config/database';
import { bunWebSocketHandler } from './websocket/wsHandler';
import { logger } from './utils/logger.util';
// Importing the model index registers all model associations before any query runs.
import './models';

/**
 * Bootstrap: validate env → verify DB → start Bun HTTP+WS server → graceful
 * shutdown on SIGINT/SIGTERM.
 */
async function main(): Promise<void> {
  const env = getEnv();

  // Fail fast if the database is unreachable at boot.
  try {
    await assertDatabaseConnection();
    logger.info('database connection OK');
  } catch (err) {
    logger.error('database connection failed at boot', { err: String(err) });
    throw err;
  }

  const app = createApp();

  const server = Bun.serve({
    port: env.PORT,
    fetch: app.fetch,
    websocket: bunWebSocketHandler,
  });

  logger.info(`backend listening on :${env.PORT}`, { env: env.NODE_ENV });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`received ${signal}, shutting down gracefully`);
    try {
      server.stop(true); // stop accepting + close active connections
      await closeDatabase();
      logger.info('shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error('error during shutdown', { err: String(err) });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('fatal boot error', { err: String(err) });
  process.exit(1);
});
