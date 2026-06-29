import { createBunWebSocket } from 'hono/bun';
import type { ServerWebSocket } from 'bun';
import type { WSContext, WSEvents } from 'hono/ws';
import type { Context } from 'hono';
import { connectionRegistry, type WsConnection } from './connectionRegistry';
import { verifyToken } from '../utils/jwt.util';
import { WS_CLIENT_MSG, WS_SERVER_MSG } from '../constants/websocket.constants';
import type { WsClientMessage } from '../types/websocket.types';
import { logger } from '../utils/logger.util';

const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>();

/** Bun websocket handler — passed to Bun.serve({ websocket }). */
export const bunWebSocketHandler = websocket;

function send(ws: WSContext<ServerWebSocket>, message: object): void {
  try {
    ws.send(JSON.stringify(message));
  } catch (err) {
    logger.warn('ws send failed during handshake', { err: String(err) });
  }
}

function parseClientMessage(raw: string): WsClientMessage | null {
  try {
    const parsed = JSON.parse(raw) as Partial<WsClientMessage>;
    if (parsed.type === WS_CLIENT_MSG.SUBSCRIBE || parsed.type === WS_CLIENT_MSG.UNSUBSCRIBE) {
      const ids = (parsed as { cameraIds?: unknown }).cameraIds;
      if (Array.isArray(ids) && ids.every((i) => typeof i === 'string')) {
        return { type: parsed.type, cameraIds: ids };
      }
      return null;
    }
    if (parsed.type === WS_CLIENT_MSG.PING) return { type: WS_CLIENT_MSG.PING };
    return null;
  } catch {
    return null;
  }
}

/**
 * WebSocket route (CONTRACTS §3). Connect: GET /ws?token=<JWT>.
 * Auth happens during the upgrade handshake; an invalid/missing token closes the
 * socket with policy-violation (1008). Each connection is registered so the
 * broadcaster can fan camera-scoped events to its owner only.
 */
export const wsUpgrade = upgradeWebSocket(async (c: Context): Promise<WSEvents<ServerWebSocket>> => {
  const token = c.req.query('token');
  let userId: string | null = null;

  if (token) {
    try {
      const payload = await verifyToken(token);
      userId = payload.sub;
    } catch {
      userId = null;
    }
  }

  let conn: WsConnection | null = null;

  return {
    onOpen(_evt, ws) {
      if (!userId) {
        send(ws, { type: 'error', message: 'unauthorized' });
        ws.close(1008, 'unauthorized');
        return;
      }
      conn = {
        id: crypto.randomUUID(),
        userId,
        subscriptions: null, // default: all owned cameras
        send: (raw: string) => ws.send(raw),
      };
      connectionRegistry.add(conn);
      send(ws, { type: WS_SERVER_MSG.CONNECTED, cameraId: null, data: { userId } });
    },

    onMessage(evt, ws) {
      if (!conn) return;
      const raw = typeof evt.data === 'string' ? evt.data : '';
      const msg = parseClientMessage(raw);
      if (!msg) return;
      switch (msg.type) {
        case WS_CLIENT_MSG.SUBSCRIBE:
          connectionRegistry.addSubscriptions(conn, msg.cameraIds);
          break;
        case WS_CLIENT_MSG.UNSUBSCRIBE:
          connectionRegistry.removeSubscriptions(conn, msg.cameraIds);
          break;
        case WS_CLIENT_MSG.PING:
          send(ws, { type: WS_SERVER_MSG.PONG, cameraId: null, data: {} });
          break;
      }
    },

    onClose() {
      if (conn) connectionRegistry.remove(conn);
      conn = null;
    },

    onError() {
      if (conn) connectionRegistry.remove(conn);
      conn = null;
    },
  };
});
