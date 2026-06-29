import { camerasRepository } from '../repositories/cameras.repository';
import { serializeCamera, type SerializedCamera } from '../serializers/cameras.serializer';
import { workerClient } from '../helpers/workerClient.helper';
import { broadcaster, invalidateOwner } from '../websocket/broadcaster';
import { AppError } from '../utils/appError.util';
import { CAMERA_STATUS } from '../constants/cameraStatus.constants';
import { logger } from '../utils/logger.util';
import type { Camera } from '../models';
import type { CreateCameraInput, UpdateCameraInput } from '../validations/cameras.validation';

/** Loads a camera and enforces ownership. 404 (not 403) to avoid leaking existence. */
async function getOwnedCameraOrThrow(id: string, userId: string): Promise<Camera> {
  const camera = await camerasRepository.findByIdForUser(id, userId);
  if (!camera) throw AppError.notFound('Camera not found');
  return camera;
}

/** Business logic for camera management + worker control (CONTRACTS §4.2 / §4.4). */
export const camerasService = {
  async list(userId: string): Promise<SerializedCamera[]> {
    const cameras = await camerasRepository.listByUser(userId);
    return cameras.map(serializeCamera);
  },

  async get(id: string, userId: string): Promise<SerializedCamera> {
    const camera = await getOwnedCameraOrThrow(id, userId);
    return serializeCamera(camera);
  },

  async create(userId: string, input: CreateCameraInput): Promise<SerializedCamera> {
    const camera = await camerasRepository.create({
      userId,
      name: input.name,
      rtspUrl: input.rtspUrl,
      location: input.location ?? null,
      enabled: input.enabled ?? true,
    });
    return serializeCamera(camera);
  },

  async update(id: string, userId: string, input: UpdateCameraInput): Promise<SerializedCamera> {
    const camera = await getOwnedCameraOrThrow(id, userId);
    const updated = await camerasRepository.update(camera, input);
    return serializeCamera(updated);
  },

  async remove(id: string, userId: string): Promise<void> {
    const camera = await getOwnedCameraOrThrow(id, userId);
    // Best-effort stop on the worker before deletion; never block delete on it.
    try {
      await workerClient.stopCamera(camera.id);
    } catch (err) {
      logger.warn('worker stop during camera delete failed (continuing)', {
        cameraId: camera.id,
        err: String(err),
      });
    }
    await camerasRepository.destroy(camera);
    invalidateOwner(id);
  },

  /** Start worker processing. Sets status=connecting; rolls back to error on failure. */
  async start(id: string, userId: string): Promise<SerializedCamera> {
    const camera = await getOwnedCameraOrThrow(id, userId);
    await camerasRepository.setStatus(camera, CAMERA_STATUS.CONNECTING, null);
    await broadcaster.cameraState(camera.id, CAMERA_STATUS.CONNECTING, 'Starting stream');
    try {
      await workerClient.startCamera(camera.id, camera.rtspUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start camera';
      await camerasRepository.setStatus(camera, CAMERA_STATUS.ERROR, message);
      await broadcaster.cameraState(camera.id, CAMERA_STATUS.ERROR, message);
      throw err;
    }
    return serializeCamera(camera);
  },

  /** Stop worker processing. Sets status=stopped regardless of worker reachability. */
  async stop(id: string, userId: string): Promise<SerializedCamera> {
    const camera = await getOwnedCameraOrThrow(id, userId);
    try {
      await workerClient.stopCamera(camera.id);
    } catch (err) {
      logger.warn('worker stop failed, marking stopped locally', {
        cameraId: camera.id,
        err: String(err),
      });
    }
    const updated = await camerasRepository.setStatus(camera, CAMERA_STATUS.STOPPED, null);
    await broadcaster.cameraState(camera.id, CAMERA_STATUS.STOPPED, 'Stopped');
    return serializeCamera(updated);
  },

  /** Proxy a WebRTC offer to the worker and return its answer (CONTRACTS §4.4). */
  async negotiateWebrtc(id: string, userId: string, sdp: string): Promise<{ sdp: string; type: 'answer' }> {
    await getOwnedCameraOrThrow(id, userId); // ownership gate
    return workerClient.webrtcOffer(id, sdp);
  },
};
