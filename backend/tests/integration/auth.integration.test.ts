import { describe, expect, it, beforeAll } from 'bun:test';
import { createApp } from '../../src/app';

/**
 * HTTP-layer integration tests that exercise routing + middleware (validation,
 * auth guard, 404 handling, canonical error shape) without requiring a database.
 * Full DB-backed flows are covered when running against the dockerized stack.
 */
describe('HTTP layer (auth + error contract)', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-12345';
    app = createApp();
  });

  it('rejects signup with an invalid body (400 VALIDATION_ERROR)', async () => {
    const res = await app.request('/api/v1/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ab', password: '123' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects protected camera route without a token (401 UNAUTHORIZED)', async () => {
    const res = await app.request('/api/v1/cameras', { method: 'GET' });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects internal route without worker key (401)', async () => {
    const res = await app.request('/api/v1/internal/stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it('returns canonical 404 for unknown routes', async () => {
    const res = await app.request('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
