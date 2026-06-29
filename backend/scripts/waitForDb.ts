import { Client } from 'pg';
import { getEnv } from '../src/config/env';

/** Blocks until Postgres accepts a connection, or exits non-zero after the deadline. */
const MAX_ATTEMPTS = 60;
const DELAY_MS = 1000;

async function waitForDb(): Promise<void> {
  const { DATABASE_URL } = getEnv();
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const client = new Client({ connectionString: DATABASE_URL });
    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      console.log(`Database is ready (attempt ${attempt}).`);
      return;
    } catch (err) {
      await client.end().catch(() => {});
      console.log(`Database not ready (attempt ${attempt}/${MAX_ATTEMPTS}): ${String(err)}`);
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }
  console.error('Database did not become ready in time.');
  process.exit(1);
}

waitForDb();
