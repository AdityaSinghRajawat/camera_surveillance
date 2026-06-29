import { sign, verify } from 'hono/jwt';
import { getEnv } from '../config/env';
import type { AuthTokenPayload } from '../types/auth.types';

/**
 * JWT helpers wrapping hono/jwt. Stateless. Token payload matches CONTRACTS §4.1:
 * { sub, username, iat, exp }.
 */
function expiresInSeconds(spec: string): number {
  // Supports "7d", "12h", "30m", "3600s", or a bare number of seconds.
  const match = /^(\d+)([smhd])?$/.exec(spec.trim());
  if (!match) return 7 * 24 * 60 * 60;
  const value = Number(match[1]);
  const unit = match[2] ?? 's';
  const mult = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86_400;
  return value * mult;
}

export async function signToken(userId: string, username: string): Promise<string> {
  const env = getEnv();
  const now = Math.floor(Date.now() / 1000);
  const payload: AuthTokenPayload = {
    sub: userId,
    username,
    iat: now,
    exp: now + expiresInSeconds(env.JWT_EXPIRES_IN),
  };
  return sign(payload, env.JWT_SECRET, 'HS256');
}

export async function verifyToken(token: string): Promise<AuthTokenPayload> {
  const env = getEnv();
  const decoded = (await verify(token, env.JWT_SECRET, 'HS256')) as unknown as AuthTokenPayload;
  return decoded;
}
