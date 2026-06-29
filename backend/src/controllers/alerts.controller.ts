import type { Context } from 'hono';
import { alertsService } from '../services/alerts.service';
import { getValidated } from '../utils/validated.util';
import type { AppBindings } from '../types/context.types';
import type { AlertQueryInput } from '../validations/alerts.validation';

/** Request/response only — delegates to alertsService (CONTRACTS §4.3). */
export const alertsController = {
  async list(c: Context<AppBindings>) {
    const user = c.get('user');
    const query = getValidated<AlertQueryInput>(c, 'query');
    const result = await alertsService.list(user.id, query);
    return c.json(result, 200);
  },

  async listForCamera(c: Context<AppBindings>) {
    const user = c.get('user');
    const { id } = getValidated<{ id: string }>(c, 'param');
    const query = getValidated<AlertQueryInput>(c, 'query');
    const result = await alertsService.listForCamera(id, user.id, query);
    return c.json(result, 200);
  },
};
