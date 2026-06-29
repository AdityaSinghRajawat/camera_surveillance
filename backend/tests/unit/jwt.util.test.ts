import { describe, expect, it, beforeAll } from 'bun:test';
import { signToken, verifyToken } from '../../src/utils/jwt.util';

describe('jwt.util', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-12345';
    process.env.JWT_EXPIRES_IN = '1h';
  });

  it('signs and verifies a token round-trip', async () => {
    const token = await signToken('user-1', 'alice');
    const payload = await verifyToken(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.username).toBe('alice');
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it('rejects a tampered token', async () => {
    const token = await signToken('user-1', 'alice');
    const tampered = token.slice(0, -2) + 'xx';
    await expect(verifyToken(tampered)).rejects.toBeDefined();
  });
});
