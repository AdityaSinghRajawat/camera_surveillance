'use strict';

/** Create alerts table + composite index for filtered pagination (CONTRACTS §8). */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('alerts', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      camera_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'cameras', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      type: {
        type: Sequelize.ENUM('person_detected'),
        allowNull: false,
      },
      label: { type: Sequelize.STRING(64), allowNull: false },
      confidence: { type: Sequelize.FLOAT, allowNull: false },
      detection_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      bounding_boxes: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      frame_timestamp: { type: Sequelize.DATE, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    // Supports: WHERE camera_id = ? ORDER BY frame_timestamp DESC (filtered pagination).
    await queryInterface.addIndex('alerts', ['camera_id', 'frame_timestamp'], {
      name: 'alerts_camera_frame_ts_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('alerts');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_alerts_type";');
  },
};
