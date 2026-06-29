import { Hono } from 'hono';
import { authController } from '../controllers/auth.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { signupSchema, loginSchema } from '../validations/auth.validation';
import type { AppBindings } from '../types/context.types';

/** /api/v1/auth (CONTRACTS §4.1). */
export const authRoute = new Hono<AppBindings>();

authRoute.post('/signup', validate('json', signupSchema), authController.signup);
authRoute.post('/login', validate('json', loginSchema), authController.login);
authRoute.get('/me', authMiddleware, authController.me);
