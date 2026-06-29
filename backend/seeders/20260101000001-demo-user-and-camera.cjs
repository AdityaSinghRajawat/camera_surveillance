'use strict';

/**
 * Seeds a demo user (admin / admin123) and one demo camera pointing at a public
 * RTSP test stream. Idempotent (ignoreDuplicates on fixed UUIDs).
 *
 * Executed via `bunx sequelize-cli db:seed:all` so Bun.password is available for
 * argon2id hashing — identical to the runtime hashing in password.util.ts.
 */
const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';
const DEMO_CAMERA_ID = '00000000-0000-4000-8000-000000000010';

async function hash(plain) {
  if (typeof Bun !== 'undefined' && Bun.password) {
    return Bun.password.hash(plain, { algorithm: 'argon2id' });
  }
  throw new Error('Seeder must run under Bun (bunx) so Bun.password is available.');
}

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const passwordHash = await hash('admin123');

    await queryInterface.bulkInsert(
      'users',
      [
        {
          id: DEMO_USER_ID,
          username: 'admin',
          password_hash: passwordHash,
          created_at: now,
          updated_at: now,
        },
      ],
      { ignoreDuplicates: true },
    );

    await queryInterface.bulkInsert(
      'cameras',
      [
        {
          id: DEMO_CAMERA_ID,
          user_id: DEMO_USER_ID,
          name: 'Demo Camera',
          // Public test stream provided by the bundled mediamtx+ffmpeg loop in compose.
          rtsp_url: 'rtsp://mediamtx:8554/demo',
          location: 'Lab',
          enabled: true,
          status: 'stopped',
          last_error: null,
          created_at: now,
          updated_at: now,
        },
      ],
      { ignoreDuplicates: true },
    );
  },

  async down(queryInterface, Sequelize) {
    const { Op } = Sequelize;
    await queryInterface.bulkDelete('cameras', { id: { [Op.in]: [DEMO_CAMERA_ID] } });
    await queryInterface.bulkDelete('users', { id: { [Op.in]: [DEMO_USER_ID] } });
  },
};
