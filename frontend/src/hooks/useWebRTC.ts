// WebRTC receive-only video for one camera (CONTRACTS §4.4).
//
// Flow:
//   1. Create an RTCPeerConnection with a recvonly video transceiver.
//   2. createOffer -> setLocalDescription, wait for ICE gathering to complete.
//   3. POST the offer SDP to /cameras/:id/stream/offer (bearer auth via api svc).
//   4. setRemoteDescription(answer).
//   5. Attach the inbound track to the provided <video> element.
//
// Connection lifecycle is driven by `active` (Start/Stop). On failure it
// reconnects with exponential backoff while still active.

import { useCallback, useEffect, useRef, useState } from 'react';
import { cameraApi } from '../services/api.service';

export type WebRTCStatus = 'idle' | 'connecting' | 'live' | 'error';

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
const MAX_BACKOFF_MS = 15_000;
const BASE_BACKOFF_MS = 1_000;
const ICE_GATHER_TIMEOUT_MS = 3_000;

export interface UseWebRTCResult {
  videoRef: React.RefObject<HTMLVideoElement>;
  status: WebRTCStatus;
  error: string | null;
  retry: () => void;
}

// Wait for ICE gathering to complete (or timeout) so the offer carries host
// candidates the worker can answer to without trickle ICE.
function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    }, ICE_GATHER_TIMEOUT_MS);
    const check = () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timeout);
        pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', check);
  });
}

export function useWebRTC(cameraId: string, active: boolean): UseWebRTCResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);
  const activeRef = useRef(active);
  const negotiatingRef = useRef(false);

  const [status, setStatus] = useState<WebRTCStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  activeRef.current = active;

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onconnectionstatechange = null;
      try {
        pcRef.current.close();
      } catch {
        // ignore
      }
      pcRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const scheduleReconnect = useCallback((connectFn: () => void) => {
    if (!activeRef.current) return;
    if (reconnectTimerRef.current) return;
    const attempt = attemptsRef.current;
    const backoff = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
    attemptsRef.current = attempt + 1;
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      connectFn();
    }, backoff + Math.random() * 500);
  }, []);

  const connect = useCallback(async () => {
    if (!activeRef.current || negotiatingRef.current) return;
    negotiatingRef.current = true;

    // Tear down any prior connection before renegotiating.
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {
        // ignore
      }
      pcRef.current = null;
    }

    setStatus('connecting');
    setError(null);

    let pc: RTCPeerConnection;
    try {
      pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    } catch {
      negotiatingRef.current = false;
      setStatus('error');
      setError('Failed to create WebRTC connection');
      scheduleReconnect(() => void connect());
      return;
    }
    pcRef.current = pc;

    pc.addTransceiver('video', { direction: 'recvonly' });

    pc.ontrack = (event: RTCTrackEvent) => {
      const [stream] = event.streams;
      if (videoRef.current && stream) {
        videoRef.current.srcObject = stream;
      }
    };

    pc.onconnectionstatechange = () => {
      const current = pcRef.current;
      if (!current) return;
      switch (current.connectionState) {
        case 'connected':
          attemptsRef.current = 0;
          setStatus('live');
          setError(null);
          break;
        case 'failed':
        case 'closed':
          if (activeRef.current) {
            setStatus('error');
            setError('Stream connection lost. Reconnecting…');
            scheduleReconnect(() => void connect());
          }
          break;
        case 'disconnected':
          // Transient; the browser may recover on its own.
          if (activeRef.current) {
            setStatus('connecting');
          }
          break;
        default:
          break;
      }
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGathering(pc);

      const localSdp = pc.localDescription?.sdp;
      if (!localSdp) throw new Error('Missing local SDP');

      const answer = await cameraApi.streamOffer(cameraId, {
        sdp: localSdp,
        type: 'offer',
      });

      if (!activeRef.current || pcRef.current !== pc) {
        // Aborted while waiting for the answer.
        return;
      }

      await pc.setRemoteDescription({ type: 'answer', sdp: answer.sdp });
    } catch (err) {
      if (activeRef.current && pcRef.current === pc) {
        const message =
          err instanceof Error ? err.message : 'Failed to negotiate stream';
        setStatus('error');
        setError(message);
        scheduleReconnect(() => void connect());
      }
    } finally {
      negotiatingRef.current = false;
    }
  }, [cameraId, scheduleReconnect]);

  const retry = useCallback(() => {
    attemptsRef.current = 0;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    void connect();
  }, [connect]);

  useEffect(() => {
    if (active) {
      attemptsRef.current = 0;
      void connect();
    } else {
      cleanup();
      setStatus('idle');
      setError(null);
    }
    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, cameraId]);

  return { videoRef, status, error, retry };
}
