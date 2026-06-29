import { Sequelize } from 'sequelize';
import { getEnv } from './env';
import { logger } from '../utils/logger.util';

/**
 * Sequelize connection singleton (getter pattern). Models register themselves
 * against the instance returned here. Connection is lazy + cached so importing a
 * model never opens a socket at module-load time (important for tests).
 */
let sequelize: Sequelize | null = null;

export function getSequelize(): Sequelize {
  if (sequelize) return sequelize;
  const env = getEnv();
  sequelize = new Sequelize(env.DATABASE_URL, {
    dialect: 'postgres',
    logging: env.LOG_LEVEL === 'debug' ? (msg) => logger.debug(msg) : false,
    pool: { max: 10, min: 0, acquire: 30_000, idle: 10_000 },
    define: {
      underscored: true, // camelCase attributes -> snake_case columns
      timestamps: true,
    },
  });
  return sequelize;
}

/** Verify connectivity. Used by server bootstrap + /health. */
export async function assertDatabaseConnection(): Promise<void> {
  await getSequelize().authenticate();
}

export async function closeDatabase(): Promise<void> {
  if (sequelize) {
    await sequelize.close();
    sequelize = null;
  }
}
