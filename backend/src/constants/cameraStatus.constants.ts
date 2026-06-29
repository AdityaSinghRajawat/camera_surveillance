/** Camera lifecycle state — shared by DB enum, API, WS payloads, frontend tile. */
export const CAMERA_STATUS = {
  STOPPED: 'stopped',
  CONNECTING: 'connecting',
  LIVE: 'live',
  ERROR: 'error',
} as const;

export type CameraStatus = (typeof CAMERA_STATUS)[keyof typeof CAMERA_STATUS];

export const CAMERA_STATUS_VALUES = Object.values(CAMERA_STATUS) as CameraStatus[];
