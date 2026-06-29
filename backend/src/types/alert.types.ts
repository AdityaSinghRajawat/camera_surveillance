import type { AlertType } from '../constants/alertType.constants';

/** Normalized bounding box (0..1) — CONTRACTS §2. */
export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
  confidence: number;
}

/** Event as POSTed by the worker (no server-assigned fields) — CONTRACTS §2.1. */
export interface DetectionEventInput {
  cameraId: string;
  type: AlertType;
  label: string;
  confidence: number;
  detectionCount: number;
  boundingBoxes: BoundingBox[];
  frameTimestamp: string; // ISO
}

/** Canonical Alert as stored/returned/broadcast — CONTRACTS §2.2. */
export interface CanonicalAlert {
  id: string;
  cameraId: string;
  type: AlertType;
  label: string;
  confidence: number;
  detectionCount: number;
  boundingBoxes: BoundingBox[];
  frameTimestamp: string; // ISO
  createdAt: string; // ISO
}
