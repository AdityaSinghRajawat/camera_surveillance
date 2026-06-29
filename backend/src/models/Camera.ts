import { DataTypes, Model, type InferAttributes, type InferCreationAttributes, type CreationOptional, type ForeignKey } from 'sequelize';
import { getSequelize } from '../config/database';
import { CAMERA_STATUS, CAMERA_STATUS_VALUES, type CameraStatus } from '../constants/cameraStatus.constants';
import { User } from './User';

/** Camera model — owned by a User, scoped per user everywhere. */
export class Camera extends Model<InferAttributes<Camera>, InferCreationAttributes<Camera>> {
  declare id: CreationOptional<string>;
  declare userId: ForeignKey<User['id']>;
  declare name: string;
  declare rtspUrl: string;
  declare location: CreationOptional<string | null>;
  declare enabled: CreationOptional<boolean>;
  declare status: CreationOptional<CameraStatus>;
  declare lastError: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Camera.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
    rtspUrl: {
      type: DataTypes.STRING(2048),
      allowNull: false,
    },
    location: {
      type: DataTypes.STRING(256),
      allowNull: true,
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    status: {
      type: DataTypes.ENUM(...CAMERA_STATUS_VALUES),
      allowNull: false,
      defaultValue: CAMERA_STATUS.STOPPED,
    },
    lastError: {
      type: DataTypes.STRING(1024),
      allowNull: true,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize: getSequelize(),
    modelName: 'Camera',
    tableName: 'cameras',
    indexes: [{ fields: ['user_id'] }],
  },
);
