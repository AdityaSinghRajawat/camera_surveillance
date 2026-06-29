'use strict';

/** Create cameras table (CONTRACTS §8). */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('cameras', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      name: { type: Sequelize.STRING(128), allowNull: false },
      rtsp_url: { type: Sequelize.STRING(2048), allowNull: false },
      location: { type: Sequelize.STRING(256), allowNull: true },
      enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      status: {
        type: Sequelize.ENUM('stopped', 'connecting', 'live', 'error'),
        allowNull: false,
        defaultValue: 'stopped',
      },
      last_error: { type: Sequelize.STRING(1024), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('cameras', ['user_id'], { name: 'cameras_user_id_idx' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('cameras');
    // Drop the enum type created by Sequelize for the status column.
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_cameras_status";');
  },
};
