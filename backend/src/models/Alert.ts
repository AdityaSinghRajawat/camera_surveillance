import { DataTypes, Model, type InferAttributes, type InferCreationAttributes, type CreationOptional, type ForeignKey } from 'sequelize';
import { getSequelize } from '../config/database';
import { ALERT_TYPE_VALUES, type AlertType } from '../constants/alertType.constants';
import type { BoundingBox } from '../types/alert.types';
import { Camera } from './Camera';

/** Alert (detection event) — one row per persisted detection. */
export class Alert extends Model<InferAttributes<Alert>, InferCreationAttributes<Alert>> {
  declare id: CreationOptional<string>;
  declare cameraId: ForeignKey<Camera['id']>;
  declare type: AlertType;
  declare label: string;
  declare confidence: number;
  declare detectionCount: number;
  declare boundingBoxes: BoundingBox[];
  declare frameTimestamp: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Alert.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    cameraId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM(...ALERT_TYPE_VALUES),
      allowNull: false,
    },
    label: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    confidence: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    detectionCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    boundingBoxes: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    frameTimestamp: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize: getSequelize(),
    modelName: 'Alert',
    tableName: 'alerts',
    indexes: [{ fields: ['camera_id', 'frame_timestamp'] }],
  },
);
