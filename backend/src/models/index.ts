import { User } from './User';
import { Camera } from './Camera';
import { Alert } from './Alert';

/**
 * Central place to wire associations. Importing this module guarantees all
 * models are registered and related before any query runs.
 */
User.hasMany(Camera, { foreignKey: 'userId', as: 'cameras', onDelete: 'CASCADE' });
Camera.belongsTo(User, { foreignKey: 'userId', as: 'owner' });

Camera.hasMany(Alert, { foreignKey: 'cameraId', as: 'alerts', onDelete: 'CASCADE' });
Alert.belongsTo(Camera, { foreignKey: 'cameraId', as: 'camera' });

export { User, Camera, Alert };
