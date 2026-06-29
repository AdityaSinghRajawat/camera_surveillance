import type { Context } from 'hono';
import { authService } from '../services/auth.service';
import { getValidated } from '../utils/validated.util';
import type { AppBindings } from '../types/context.types';
import type { SignupInput, LoginInput } from '../validations/auth.validation';

/** Request/response only — delegates all logic to authService (CONTRACTS §4.1). */
export const authController = {
  async signup(c: Context<AppBindings>) {
    const input = getValidated<SignupInput>(c, 'json');
    const result = await authService.signup(input);
    return c.json({ data: result }, 201);
  },

  async login(c: Context<AppBindings>) {
    const input = getValidated<LoginInput>(c, 'json');
    const result = await authService.login(input);
    return c.json({ data: result }, 200);
  },

  async me(c: Context<AppBindings>) {
    const user = c.get('user');
    const serialized = await authService.getById(user.id);
    return c.json({ data: { user: serialized } }, 200);
  },
};
