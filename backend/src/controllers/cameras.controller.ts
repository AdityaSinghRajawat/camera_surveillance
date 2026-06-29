import type { Context } from 'hono';
import { camerasService } from '../services/cameras.service';
import { getValidated } from '../utils/validated.util';
import type { AppBindings } from '../types/context.types';
import type { CreateCameraInput, UpdateCameraInput } from '../validations/cameras.validation';

/** Request/response only — delegates to camerasService (CONTRACTS §4.2 / §4.4). */
export const camerasController = {
  async list(c: Context<AppBindings>) {
    const user = c.get('user');
    const data = await camerasService.list(user.id);
    return c.json({ data }, 200);
  },

  async create(c: Context<AppBindings>) {
    const user = c.get('user');
    const input = getValidated<CreateCameraInput>(c, 'json');
    const data = await camerasService.create(user.id, input);
    return c.json({ data }, 201);
  },

  async get(c: Context<AppBindings>) {
    const user = c.get('user');
    const { id } = getValidated<{ id: string }>(c, 'param');
    const data = await camerasService.get(id, user.id);
    return c.json({ data }, 200);
  },

  async update(c: Context<AppBindings>) {
    const user = c.get('user');
    const { id } = getValidated<{ id: string }>(c, 'param');
    const input = getValidated<UpdateCameraInput>(c, 'json');
    const data = await camerasService.update(id, user.id, input);
    return c.json({ data }, 200);
  },

  async remove(c: Context<AppBindings>) {
    const user = c.get('user');
    const { id } = getValidated<{ id: string }>(c, 'param');
    await camerasService.remove(id, user.id);
    return c.body(null, 204);
  },

  async start(c: Context<AppBindings>) {
    const user = c.get('user');
    const { id } = getValidated<{ id: string }>(c, 'param');
    const data = await camerasService.start(id, user.id);
    return c.json({ data }, 200);
  },

  async stop(c: Context<AppBindings>) {
    const user = c.get('user');
    const { id } = getValidated<{ id: string }>(c, 'param');
    const data = await camerasService.stop(id, user.id);
    return c.json({ data }, 200);
  },

  async streamOffer(c: Context<AppBindings>) {
    const user = c.get('user');
    const { id } = getValidated<{ id: string }>(c, 'param');
    const { sdp } = getValidated<{ sdp: string; type: 'offer' }>(c, 'json');
    const answer = await camerasService.negotiateWebrtc(id, user.id, sdp);
    return c.json({ data: answer }, 200);
  },
};
