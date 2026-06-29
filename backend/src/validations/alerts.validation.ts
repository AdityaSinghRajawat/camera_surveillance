import { z } from 'zod';
import { PAGINATION } from '../constants/pagination.constants';
import { ALERT_TYPE_VALUES } from '../constants/alertType.constants';

/** Query params for GET /alerts and GET /cameras/:id/alerts (CONTRACTS §4.3). */
export const alertQuerySchema = z.object({
  cameraId: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().positive().default(PAGINATION.DEFAULT_PAGE),
  pageSize: z.coerce
    .number()
    .int()
    .positive()
    .max(PAGINATION.MAX_PAGE_SIZE)
    .default(PAGINATION.DEFAULT_PAGE_SIZE),
});

const boundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  confidence: z.number().min(0).max(1),
});

/** Detection event POSTed by the worker (CONTRACTS §2.1 / §4.5). */
export const detectionEventSchema = z.object({
  cameraId: z.string().uuid(),
  type: z.enum(ALERT_TYPE_VALUES as [string, ...string[]]),
  label: z.string().min(1).max(64),
  confidence: z.number().min(0).max(1),
  detectionCount: z.number().int().min(1),
  boundingBoxes: z.array(boundingBoxSchema),
  frameTimestamp: z.string().datetime({ offset: true }),
});

/** Stats event POSTed by the worker (CONTRACTS §3.3 / §4.5). */
export const statsEventSchema = z.object({
  cameraId: z.string().uuid(),
  fps: z.number().min(0),
  detectionsPerMinute: z.number().min(0),
  state: z.enum(['stopped', 'connecting', 'live', 'error']),
  timestamp: z.string().datetime({ offset: true }),
});

/** Camera-state event POSTed by the worker (CONTRACTS §4.5). */
export const cameraStateEventSchema = z.object({
  cameraId: z.string().uuid(),
  state: z.enum(['stopped', 'connecting', 'live', 'error']),
  message: z.string().max(1024).optional(),
});

/** WebRTC offer forwarded to the worker (CONTRACTS §4.4). */
export const webrtcOfferSchema = z.object({
  sdp: z.string().min(1),
  type: z.literal('offer'),
});

export type AlertQueryInput = z.infer<typeof alertQuerySchema>;
