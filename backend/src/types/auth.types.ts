/** JWT payload (CONTRACTS §4.1). */
export interface AuthTokenPayload {
  sub: string; // userId
  username: string;
  iat: number;
  exp: number;
  [key: string]: string | number; // index signature required by hono/jwt JWTPayload
}

/** Authenticated principal attached to the Hono context after auth middleware. */
export interface AuthUser {
  id: string;
  username: string;
}
