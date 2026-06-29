import { Op, type WhereOptions, type InferAttributes } from 'sequelize';
import { Alert, Camera } from '../models';
import type { DetectionEventInput } from '../types/alert.types';

export interface AlertQueryOptions {
  userId: string;
  cameraId?: string;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}

export interface AlertPage {
  rows: Alert[];
  total: number;
}

/** Data access for alerts. Sequelize queries ONLY. Always ownership-scoped via the camera join. */
export const alertsRepository = {
  create(event: DetectionEventInput): Promise<Alert> {
    return Alert.create({
      cameraId: event.cameraId,
      type: event.type,
      label: event.label,
      confidence: event.confidence,
      detectionCount: event.detectionCount,
      boundingBoxes: event.boundingBoxes,
      frameTimestamp: new Date(event.frameTimestamp),
    });
  },

  async query(opts: AlertQueryOptions): Promise<AlertPage> {
    const alertWhere: WhereOptions<InferAttributes<Alert>> = {};
    if (opts.cameraId) {
      Object.assign(alertWhere, { cameraId: opts.cameraId });
    }
    if (opts.from || opts.to) {
      const range: Record<symbol, Date> = {};
      if (opts.from) range[Op.gte] = opts.from;
      if (opts.to) range[Op.lte] = opts.to;
      Object.assign(alertWhere, { frameTimestamp: range });
    }

    const { rows, count } = await Alert.findAndCountAll({
      where: alertWhere,
      include: [
        {
          model: Camera,
          as: 'camera',
          attributes: [],
          required: true,
          where: { userId: opts.userId },
        },
      ],
      order: [['frameTimestamp', 'DESC']],
      limit: opts.limit,
      offset: opts.offset,
      distinct: true,
      col: 'id',
    });

    return { rows, total: count };
  },
};
