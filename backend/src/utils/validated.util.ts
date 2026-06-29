import type { Context } from 'hono';
import type { ValidationTargets } from 'hono';

/**
 * Reads validated request data set by the zod validator middleware, typed at the
 * call site. Avoids leaking per-route validation generics into controller
 * signatures while keeping controllers fully typed.
 */
export function getValidated<T>(c: Context, target: keyof ValidationTargets): T {
  return (c.req as unknown as { valid: (t: keyof ValidationTargets) => T }).valid(target);
}
