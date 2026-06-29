import type { User } from '../models';

export interface SerializedUser {
  id: string;
  username: string;
  createdAt: string;
}

/** Public user shape (never leaks passwordHash) — CONTRACTS §4.1. */
export function serializeUser(user: User): SerializedUser {
  return {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt.toISOString(),
  };
}
