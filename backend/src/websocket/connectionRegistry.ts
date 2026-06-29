import type { WsServerMessage } from '../types/websocket.types';
import { logger } from '../utils/logger.util';

/**
 * A single live WebSocket connection. `subscriptions === null` means "deliver
 * every event for cameras this user owns" (the default before an explicit
 * subscribe). A non-null set narrows delivery to that subset (still ownership
 * filtered upstream).
 */
export interface WsConnection {
  id: string;
  userId: string;
  subscriptions: Set<string> | null;
  send: (raw: string) => void;
}

/**
 * In-memory registry of connections, indexed by user for O(1) fan-out.
 * Single-process design; horizontal scale-out would back this with Redis pub/sub
 * (documented as a future improvement). The fan-out interface stays identical.
 */
class ConnectionRegistry {
  private byUser = new Map<string, Map<string, WsConnection>>();

  add(conn: WsConnection): void {
    let conns = this.byUser.get(conn.userId);
    if (!conns) {
      conns = new Map();
      this.byUser.set(conn.userId, conns);
    }
    conns.set(conn.id, conn);
    logger.debug('ws connection added', { userId: conn.userId, id: conn.id });
  }

  remove(conn: WsConnection): void {
    const conns = this.byUser.get(conn.userId);
    if (!conns) return;
    conns.delete(conn.id);
    if (conns.size === 0) this.byUser.delete(conn.userId);
    logger.debug('ws connection removed', { userId: conn.userId, id: conn.id });
  }

  setSubscriptions(conn: WsConnection, cameraIds: string[]): void {
    conn.subscriptions = new Set(cameraIds);
  }

  addSubscriptions(conn: WsConnection, cameraIds: string[]): void {
    if (!conn.subscriptions) conn.subscriptions = new Set();
    for (const id of cameraIds) conn.subscriptions.add(id);
  }

  removeSubscriptions(conn: WsConnection, cameraIds: string[]): void {
    if (!conn.subscriptions) return;
    for (const id of cameraIds) conn.subscriptions.delete(id);
  }

  /**
   * Deliver a camera-scoped message to one user's matching connections.
   * A connection matches when it has no explicit subscription set (receives all)
   * or has subscribed to this camera.
   */
  deliverToUserForCamera(userId: string, cameraId: string, message: WsServerMessage): number {
    const conns = this.byUser.get(userId);
    if (!conns) return 0;
    const raw = JSON.stringify(message);
    let delivered = 0;
    for (const conn of conns.values()) {
      if (conn.subscriptions === null || conn.subscriptions.has(cameraId)) {
        try {
          conn.send(raw);
          delivered++;
        } catch (err) {
          logger.warn('ws send failed', { id: conn.id, err: String(err) });
        }
      }
    }
    return delivered;
  }

  /** Send a non-camera message to all of a user's connections. */
  sendToUser(userId: string, message: WsServerMessage): void {
    const conns = this.byUser.get(userId);
    if (!conns) return;
    const raw = JSON.stringify(message);
    for (const conn of conns.values()) {
      try {
        conn.send(raw);
      } catch (err) {
        logger.warn('ws send failed', { id: conn.id, err: String(err) });
      }
    }
  }

  stats(): { users: number; connections: number } {
    let connections = 0;
    for (const conns of this.byUser.values()) connections += conns.size;
    return { users: this.byUser.size, connections };
  }
}

export const connectionRegistry = new ConnectionRegistry();
