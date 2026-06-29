import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { AppError } from '../utils/appError.util';
import { ERROR_CODE } from '../constants/errorCodes.constants';
import { logger } from '../utils/logger.util';
import { isProduction } from '../config/env';

/**
 * Central error handler (registered via app.onError). Produces the canonical
 * `{ error: { code, message, details } }` shape for every failure path.
 */
export function errorHandler(err: Error, c: Context): Response {
  if (err instanceof AppError) {
    if (err.status >= 500) logger.error('app error', { code: err.code, message: err.message });
    return c.json(
      { error: { code: err.code, message: err.message, details: err.details ?? undefined } },
      err.status as 400,
    );
  }

  if (err instanceof ZodError) {
    return c.json(
      { error: { code: ERROR_CODE.VALIDATION_ERROR, message: 'Validation failed', details: err.flatten() } },
      400,
    );
  }

  if (err instanceof HTTPException) {
    return c.json(
      { error: { code: ERROR_CODE.INTERNAL_ERROR, message: err.message } },
      err.status,
    );
  }

  logger.error('unhandled error', { message: err.message, stack: err.stack });
  return c.json(
    {
      error: {
        code: ERROR_CODE.INTERNAL_ERROR,
        message: isProduction() ? 'Internal server error' : err.message,
      },
    },
    500,
  );
}

/** 404 fallback for unmatched routes. */
export function notFoundHandler(c: Context): Response {
  return c.json(
    { error: { code: ERROR_CODE.NOT_FOUND, message: `Route not found: ${c.req.method} ${c.req.path}` } },
    404,
  );
}
