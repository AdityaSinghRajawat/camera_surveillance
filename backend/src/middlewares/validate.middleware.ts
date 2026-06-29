import { zValidator } from '@hono/zod-validator';
import type { ZodSchema } from 'zod';
import type { ValidationTargets } from 'hono';
import { AppError } from '../utils/appError.util';

/**
 * Thin wrapper over @hono/zod-validator that funnels validation failures into the
 * canonical error shape (400 VALIDATION_ERROR) via the central error middleware.
 * Validated, typed data is read downstream with `c.req.valid(target)`.
 */
export function validate<T extends ZodSchema, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      throw AppError.badRequest('Validation failed', result.error.flatten());
    }
  });
}
