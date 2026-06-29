/**
 * Sequelize CLI config (CommonJS, required by sequelize-cli for migrations/seeders).
 * Uses DATABASE_URL for every environment — single source of truth, matches the
 * runtime connection in src/config/database.ts.
 */
const common = {
  use_env_variable: 'DATABASE_URL',
  dialect: 'postgres',
  define: {
    underscored: true,
    timestamps: true,
  },
};

module.exports = {
  development: { ...common },
  test: { ...common },
  production: { ...common },
};
