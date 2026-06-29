import { describe, expect, it } from 'bun:test';
import { serializeAlert } from '../../src/serializers/alerts.serializer';
import type { Alert } from '../../src/models';

describe('alerts.serializer', () => {
  it('produces the canonical alert shape with ISO timestamps', () => {
    const frame = new Date('2026-06-29T12:00:00.000Z');
    const created = new Date('2026-06-29T12:00:00.050Z');
    const fake = {
      id: 'a1',
      cameraId: 'c1',
      type: 'person_detected',
      label: 'person',
      confidence: 0.92,
      detectionCount: 2,
      boundingBoxes: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.4, confidence: 0.92 }],
      frameTimestamp: frame,
      createdAt: created,
    } as unknown as Alert;

    expect(serializeAlert(fake)).toEqual({
      id: 'a1',
      cameraId: 'c1',
      type: 'person_detected',
      label: 'person',
      confidence: 0.92,
      detectionCount: 2,
      boundingBoxes: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.4, confidence: 0.92 }],
      frameTimestamp: '2026-06-29T12:00:00.000Z',
      createdAt: '2026-06-29T12:00:00.050Z',
    });
  });
});
