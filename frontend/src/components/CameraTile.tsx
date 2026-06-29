// A single camera tile: live WebRTC video, real stream state, Start/Stop,
// recent person-detection alerts and live FPS/detection stats.
//
// State source of truth:
//   - The camera's REST `status` is the baseline.
//   - Live `camera_state` WS messages override it in real time.
//   - The WebRTC connection is driven by whether the (effective) state is a
//     started state (connecting/live).

import { useEffect, useMemo, useState } from 'react';
import type { Camera, CameraState, Stats } from '../types';
import { useWebRTC } from '../hooks/useWebRTC';
import { useAlerts } from '../hooks/useAlerts';
import { useWebSocketEvent } from '../hooks/useWebSocket';
import { useCameraMutations } from '../hooks/useCameras';
import { ApiError } from '../services/api.service';
import { StatusBadge } from './StatusBadge';
import { StatsBadge } from './StatsBadge';
import { AlertFeed } from './AlertFeed';

function isStarted(state: CameraState): boolean {
  return state === 'connecting' || state === 'live';
}

export function CameraTile({ camera }: { camera: Camera }) {
  const { startCamera, stopCamera, patchCameraInCache } = useCameraMutations();

  // Effective state: REST status overridden by live WS camera_state.
  const [liveState, setLiveState] = useState<CameraState | null>(null);
  const [liveMessage, setLiveMessage] = useState<string>('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const effectiveState: CameraState = liveState ?? camera.status;

  // Reset live override if the camera's REST status changes (e.g. after start/stop).
  useEffect(() => {
    setLiveState(null);
  }, [camera.status]);

  useWebSocketEvent('camera_state', (msg) => {
    if (msg.cameraId !== camera.id) return;
    setLiveState(msg.data.state);
    setLiveMessage(msg.data.message ?? '');
    // Keep the React Query cache roughly in sync so the management list updates.
    patchCameraInCache(camera.id, { status: msg.data.state });
  });

  useWebSocketEvent('stats', (msg) => {
    if (msg.cameraId !== camera.id) return;
    setStats(msg.data);
    if (msg.data.state) {
      setLiveState(msg.data.state);
    }
  });

  const started = isStarted(effectiveState);
  const webrtc = useWebRTC(camera.id, started);

  const { alerts, isLoading, isError, error } = useAlerts(camera.id);

  const isStarting = startCamera.isPending;
  const isStopping = stopCamera.isPending;
  const busy = isStarting || isStopping;

  const handleStart = () => {
    setActionError(null);
    startCamera.mutate(camera.id, {
      onError: (err) =>
        setActionError(err instanceof ApiError ? err.message : 'Failed to start'),
    });
  };

  const handleStop = () => {
    setActionError(null);
    stopCamera.mutate(camera.id, {
      onError: (err) =>
        setActionError(err instanceof ApiError ? err.message : 'Failed to stop'),
    });
  };

  // Stream-state message shown over the video.
  const videoOverlay = useMemo(() => {
    if (!started) {
      return { kind: 'stopped' as const, text: 'Stream stopped' };
    }
    if (webrtc.status === 'live' && effectiveState === 'live') {
      return null;
    }
    if (webrtc.status === 'error' || effectiveState === 'error') {
      return {
        kind: 'error' as const,
        text:
          webrtc.error ||
          liveMessage ||
          camera.lastError ||
          'Stream error',
      };
    }
    return { kind: 'connecting' as const, text: 'Connecting to stream…' };
  }, [
    started,
    webrtc.status,
    webrtc.error,
    effectiveState,
    liveMessage,
    camera.lastError,
  ]);

  return (
    <div className="camera-tile">
      <div className="tile-header">
        <div className="tile-title">
          <span className="tile-name">{camera.name}</span>
          {camera.location && <span className="tile-location">{camera.location}</span>}
        </div>
        <StatusBadge state={effectiveState} />
      </div>

      <div className="tile-video-wrap">
        <video
          ref={webrtc.videoRef}
          className="tile-video"
          autoPlay
          playsInline
          muted
        />
        {videoOverlay && (
          <div className={`video-overlay overlay-${videoOverlay.kind}`}>
            {videoOverlay.kind === 'connecting' && <div className="spinner" />}
            <div className="overlay-text">{videoOverlay.text}</div>
            {videoOverlay.kind === 'error' && started && (
              <button
                type="button"
                className="btn btn-small btn-secondary"
                onClick={webrtc.retry}
              >
                Retry
              </button>
            )}
          </div>
        )}
        {webrtc.status === 'live' && effectiveState === 'live' && (
          <div className="live-indicator">
            <span className="badge-dot live-dot" /> LIVE
          </div>
        )}
      </div>

      <div className="tile-controls">
        <div className="tile-controls-left">
          {started ? (
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleStop}
              disabled={busy}
            >
              {isStopping ? 'Stopping…' : 'Stop'}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleStart}
              disabled={busy}
            >
              {isStarting ? 'Starting…' : 'Start'}
            </button>
          )}
        </div>
        <StatsBadge stats={stats} />
      </div>

      {actionError && <div className="tile-error">{actionError}</div>}
      {effectiveState === 'error' && camera.lastError && (
        <div className="tile-error">{camera.lastError}</div>
      )}

      <AlertFeed
        alerts={alerts}
        isLoading={isLoading}
        isError={isError}
        error={error}
      />
    </div>
  );
}
