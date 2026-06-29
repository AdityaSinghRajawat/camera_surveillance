import { getEnv } from '../config/env';
import { logger } from '../utils/logger.util';
import { AppError } from '../utils/appError.util';

/**
 * Outbound client to the Go worker control API (CONTRACTS §5), authenticated with
 * the shared X-Worker-Key. Centralises base URL, headers, timeouts and error
 * translation so services stay transport-agnostic.
 */
const REQUEST_TIMEOUT_MS = 8000;

async function workerFetch(path: string, body: unknown): Promise<Response> {
  const env = getEnv();
  const url = `${env.WORKER_CONTROL_URL}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Worker-Key': env.WORKER_API_KEY,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    logger.error('worker request failed', { path, err: String(err) });
    throw AppError.workerUnavailable(`Worker did not respond: ${String(err)}`);
  } finally {
    clearTimeout(timeout);
  }
}

export const workerClient = {
  async startCamera(cameraId: string, rtspUrl: string): Promise<void> {
    const res = await workerFetch(`/cameras/${cameraId}/start`, { cameraId, rtspUrl });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw AppError.workerUnavailable(`Worker failed to start camera (${res.status}): ${text}`);
    }
  },

  async stopCamera(cameraId: string): Promise<void> {
    const res = await workerFetch(`/cameras/${cameraId}/stop`, { cameraId });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw AppError.workerUnavailable(`Worker failed to stop camera (${res.status}): ${text}`);
    }
  },

  /** Forward a browser SDP offer; return the worker's SDP answer (CONTRACTS §4.4 → §5). */
  async webrtcOffer(cameraId: string, sdp: string): Promise<{ sdp: string; type: 'answer' }> {
    const res = await workerFetch(`/cameras/${cameraId}/webrtc/offer`, { sdp, type: 'offer' });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw AppError.workerUnavailable(`Worker failed to negotiate WebRTC (${res.status}): ${text}`);
    }
    const answer = (await res.json()) as { sdp?: string; type?: string };
    if (!answer.sdp || answer.type !== 'answer') {
      throw AppError.workerUnavailable('Worker returned an invalid WebRTC answer');
    }
    return { sdp: answer.sdp, type: 'answer' };
  },
};
