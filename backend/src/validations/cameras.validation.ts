import { z } from 'zod';

const rtspUrl = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((v) => v.startsWith('rtsp://') || v.startsWith('rtsps://'), {
    message: 'rtspUrl must start with rtsp:// or rtsps://',
  });

export const createCameraSchema = z.object({
  name: z.string().trim().min(1).max(128),
  rtspUrl,
  location: z.string().trim().max(256).optional().nullable(),
  enabled: z.boolean().optional(),
});

export const updateCameraSchema = z
  .object({
    name: z.string().trim().min(1).max(128).optional(),
    rtspUrl: rtspUrl.optional(),
    location: z.string().trim().max(256).optional().nullable(),
    enabled: z.boolean().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'At least one field is required' });

export const cameraIdParamSchema = z.object({
  id: z.string().uuid('camera id must be a uuid'),
});

export type CreateCameraInput = z.infer<typeof createCameraSchema>;
export type UpdateCameraInput = z.infer<typeof updateCameraSchema>;
