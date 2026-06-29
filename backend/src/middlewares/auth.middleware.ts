import { createMiddleware } from 'hono/factory';
import { verifyToken } from '../utils/jwt.util';
import { AppError } from '../utils/appError.util';
import type { AppBindings } from '../types/context.types';

/**
 * JWT auth guard. Reads `Authorization: Bearer <token>`, verifies it, and sets
 * the authenticated principal on the context. All camera/alert routes use this.
 */
export const authMiddleware = createMiddleware<AppBindings>(async (c, next) => {
  const header = c.req.header('Authorization');
  if (!header || !header.startsWith('Bearer ')) {
    throw AppError.unauthorized('Missing or malformed Authorization header');
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = await verifyToken(token);
    c.set('user', { id: payload.sub, username: payload.username });
  } catch {
    throw AppError.unauthorized('Invalid or expired token');
  }
  await next();
});
