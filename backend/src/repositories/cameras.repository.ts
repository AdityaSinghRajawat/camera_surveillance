import { Camera } from '../models';
import type { CameraStatus } from '../constants/cameraStatus.constants';

export interface CameraCreateData {
  userId: string;
  name: string;
  rtspUrl: string;
  location?: string | null;
  enabled?: boolean;
}

export interface CameraUpdateData {
  name?: string;
  rtspUrl?: string;
  location?: string | null;
  enabled?: boolean;
}

/** Data access for cameras. Sequelize queries ONLY. Ownership is always scoped here. */
export const camerasRepository = {
  listByUser(userId: string): Promise<Camera[]> {
    return Camera.findAll({ where: { userId }, order: [['createdAt', 'ASC']] });
  },

  findByIdForUser(id: string, userId: string): Promise<Camera | null> {
    return Camera.findOne({ where: { id, userId } });
  },

  findById(id: string): Promise<Camera | null> {
    return Camera.findByPk(id);
  },

  create(data: CameraCreateData): Promise<Camera> {
    return Camera.create(data);
  },

  async update(camera: Camera, data: CameraUpdateData): Promise<Camera> {
    return camera.update(data);
  },

  async setStatus(camera: Camera, status: CameraStatus, lastError: string | null = null): Promise<Camera> {
    return camera.update({ status, lastError });
  },

  async destroy(camera: Camera): Promise<void> {
    await camera.destroy();
  },

  /** Resolve the owning user id of a camera (used by WS fan-out). */
  async getOwnerUserId(cameraId: string): Promise<string | null> {
    const camera = await Camera.findByPk(cameraId, { attributes: ['userId'] });
    return camera ? camera.userId : null;
  },
};
