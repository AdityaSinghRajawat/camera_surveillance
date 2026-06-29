import type { AuthUser } from './auth.types';

/**
 * Hono context variable bindings. Auth middleware sets `user`; downstream
 * controllers read it type-safely via `c.get('user')`.
 */
export interface AppVariables {
  user: AuthUser;
}

export type AppBindings = {
  Variables: AppVariables;
};
