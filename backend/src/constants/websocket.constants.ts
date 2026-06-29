/** WebSocket message types (server↔client) — must match CONTRACTS §3. */
export const WS_SERVER_MSG = {
  ALERT: 'alert',
  STATS: 'stats',
  CAMERA_STATE: 'camera_state',
  CONNECTED: 'connected',
  PONG: 'pong',
} as const;

export const WS_CLIENT_MSG = {
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe',
  PING: 'ping',
} as const;

export type WsServerMsgType = (typeof WS_SERVER_MSG)[keyof typeof WS_SERVER_MSG];
export type WsClientMsgType = (typeof WS_CLIENT_MSG)[keyof typeof WS_CLIENT_MSG];
