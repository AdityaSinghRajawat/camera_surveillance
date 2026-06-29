// Single shared WebSocket connection to the backend (CONTRACTS §3).
//
// Design: a small React context owns ONE WebSocket for the whole app. It:
//   - connects to VITE_WS_URL with ?token=<JWT>
//   - on open, sends a `subscribe` for all currently-known camera ids
//   - sends a heartbeat `ping` on an interval
//   - auto-reconnects with exponential backoff on close/error
//   - dispatches typed server messages to subscribers (a tiny event emitter)
//
// Components consume it through `useWebSocketEvent(type, handler)` to react to
// `alert` / `stats` / `camera_state` messages without manual refresh, and
// `useWebSocketStatus()` to render the connection indicator.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createElement } from 'react';
import type { ClientMessage, ServerMessage, ServerMessageType } from '../types';
import { useAuth } from './useAuth';

const WS_PATH = import.meta.env.VITE_WS_URL ?? '/ws';
const PING_INTERVAL_MS = 25_000;
const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;

export type WsConnectionStatus = 'idle' | 'connecting' | 'open' | 'closed';

type Handler<T extends ServerMessageType> = (
  msg: Extract<ServerMessage, { type: T }>,
) => void;

interface WebSocketContextValue {
  status: WsConnectionStatus;
  // Register/unregister camera ids the client cares about; the provider keeps a
  // live `subscribe` in sync so the backend only sends relevant events.
  registerCameras: (ids: string[]) => void;
  // Subscribe to a server message type. Returns an unsubscribe function.
  on: <T extends ServerMessageType>(type: T, handler: Handler<T>) => () => void;
  send: (msg: ClientMessage) => void;
}

const WebSocketContext = createContext<WebSocketContextValue | undefined>(undefined);

function buildWsUrl(token: string): string {
  // VITE_WS_URL is same-origin in prod ("/ws") and proxied in dev. Resolve to an
  // absolute ws(s):// URL against the current origin.
  if (WS_PATH.startsWith('ws://') || WS_PATH.startsWith('wss://')) {
    return `${WS_PATH}?token=${encodeURIComponent(token)}`;
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const path = WS_PATH.startsWith('/') ? WS_PATH : `/${WS_PATH}`;
  return `${proto}//${window.location.host}${path}?token=${encodeURIComponent(token)}`;
}

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { token, isAuthenticated } = useAuth();
  const [status, setStatus] = useState<WsConnectionStatus>('idle');

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cameraIdsRef = useRef<string[]>([]);
  const shouldRunRef = useRef(false);

  // Map<type, Set<handler>>; handlers are stored untyped internally and narrowed
  // at registration via the public `on` signature.
  const handlersRef = useRef<Map<ServerMessageType, Set<(msg: ServerMessage) => void>>>(
    new Map(),
  );

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const sendSubscribe = useCallback(() => {
    if (cameraIdsRef.current.length > 0) {
      send({ type: 'subscribe', cameraIds: cameraIdsRef.current });
    }
  }, [send]);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!shouldRunRef.current || !token) return;
    // Avoid duplicate sockets.
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    setStatus('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(buildWsUrl(token));
    } catch {
      scheduleReconnect();
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0;
      setStatus('open');
      sendSubscribe();
      // Heartbeat.
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
      pingTimerRef.current = setInterval(() => {
        send({ type: 'ping' });
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event: MessageEvent) => {
      let parsed: ServerMessage;
      try {
        parsed = JSON.parse(event.data as string) as ServerMessage;
      } catch {
        return;
      }
      const set = handlersRef.current.get(parsed.type);
      if (set) {
        for (const handler of set) {
          try {
            handler(parsed);
          } catch {
            // A faulty subscriber must not break the dispatch loop.
          }
        }
      }
    };

    ws.onerror = () => {
      // onclose will follow and handle reconnection.
    };

    ws.onclose = () => {
      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
      wsRef.current = null;
      if (shouldRunRef.current) {
        setStatus('connecting');
        scheduleReconnect();
      } else {
        setStatus('closed');
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, send, sendSubscribe]);

  const scheduleReconnect = useCallback(() => {
    if (!shouldRunRef.current) return;
    if (reconnectTimerRef.current) return;
    const attempt = reconnectAttemptsRef.current;
    const backoff = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
    // Add jitter to avoid thundering herd.
    const delay = backoff + Math.random() * 1000;
    reconnectAttemptsRef.current = attempt + 1;
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      connect();
    }, delay);
  }, [connect]);

  // Open/close the connection based on auth state.
  useEffect(() => {
    if (isAuthenticated && token) {
      shouldRunRef.current = true;
      reconnectAttemptsRef.current = 0;
      connect();
    } else {
      shouldRunRef.current = false;
      clearTimers();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setStatus('idle');
    }

    return () => {
      shouldRunRef.current = false;
      clearTimers();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, token]);

  const registerCameras = useCallback(
    (ids: string[]) => {
      const sorted = [...ids].sort();
      const prev = cameraIdsRef.current;
      const changed =
        sorted.length !== prev.length || sorted.some((id, i) => id !== prev[i]);
      cameraIdsRef.current = sorted;
      if (changed) {
        sendSubscribe();
      }
    },
    [sendSubscribe],
  );

  const on = useCallback(
    <T extends ServerMessageType>(type: T, handler: Handler<T>): (() => void) => {
      let set = handlersRef.current.get(type);
      if (!set) {
        set = new Set();
        handlersRef.current.set(type, set);
      }
      const generic = handler as (msg: ServerMessage) => void;
      set.add(generic);
      return () => {
        set?.delete(generic);
      };
    },
    [],
  );

  const value = useMemo<WebSocketContextValue>(
    () => ({ status, registerCameras, on, send }),
    [status, registerCameras, on, send],
  );

  return createElement(WebSocketContext.Provider, { value }, children);
}

function useWebSocketContext(): WebSocketContextValue {
  const ctx = useContext(WebSocketContext);
  if (!ctx) {
    throw new Error('useWebSocket hooks must be used within a WebSocketProvider');
  }
  return ctx;
}

export function useWebSocketStatus(): WsConnectionStatus {
  return useWebSocketContext().status;
}

// Subscribe to a server message type for the component's lifetime.
export function useWebSocketEvent<T extends ServerMessageType>(
  type: T,
  handler: Handler<T>,
): void {
  const { on } = useWebSocketContext();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const stable: Handler<T> = (msg) => handlerRef.current(msg);
    const off = on(type, stable);
    return off;
  }, [on, type]);
}

// Keep the WS subscription in sync with the set of cameras the app is showing.
export function useRegisterCameras(ids: string[]): void {
  const { registerCameras } = useWebSocketContext();
  const key = ids.slice().sort().join(',');
  useEffect(() => {
    registerCameras(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerCameras, key]);
}
