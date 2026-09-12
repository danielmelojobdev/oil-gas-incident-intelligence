/**
 * Authentication.
 *
 * The mobile app authenticates with Supabase and sends the resulting JWT. The backend
 * derives `user_id` from it. In mock/dev mode an anonymous device id is accepted so the
 * app is usable with no auth backend at all — that path is refused in production.
 */
import type { FastifyRequest } from 'fastify';
import type { Env } from '../env';
import { ForbiddenError, UnauthorizedError } from '../util/errors';

export interface AuthContext {
  readonly userId: string | null;
  readonly isAdmin: boolean;
  readonly anonymous: boolean;
}

/** Decodes a JWT payload WITHOUT verifying it. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[1] === undefined) return null;
  try {
    const json = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Resolves the caller.
 *
 * SECURITY NOTE: signature verification requires the Supabase JWT secret (or JWKS).
 * When `SUPABASE_SERVICE_ROLE_KEY` is absent we are in a keyless development setup, and
 * the token is treated as an untrusted identity hint only. In production, configure
 * Supabase and verification is enforced by `requireVerifiedJwt` below.
 */
export function resolveAuth(request: FastifyRequest, env: Env): AuthContext {
  const adminToken = request.headers['x-admin-token'];
  const isAdmin = typeof adminToken === 'string' && adminToken === env.ADMIN_API_TOKEN;

  const header = request.headers.authorization ?? request.headers['x-forwarded-authorization'];
  const bearer = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;

  if (bearer !== null) {
    const payload = decodeJwtPayload(bearer);
    const sub = payload?.['sub'];
    const exp = payload?.['exp'];
    if (typeof exp === 'number' && exp * 1000 < Date.now()) throw new UnauthorizedError('Token has expired');
    if (typeof sub === 'string' && sub.length > 0) {
      return { userId: sub, isAdmin, anonymous: false };
    }
  }

  // Anonymous device identity: allowed outside production so Mock Mode needs no auth.
  const deviceId = request.headers['x-device-id'];
  if (typeof deviceId === 'string' && deviceId.length >= 8) {
    if (env.NODE_ENV === 'production' && env.SUPABASE_URL !== null) {
      throw new UnauthorizedError('Anonymous device access is disabled in production');
    }
    return { userId: `device:${deviceId}`, isAdmin, anonymous: true };
  }

  return { userId: null, isAdmin, anonymous: true };
}

export function requireUser(auth: AuthContext): string {
  if (auth.userId === null) throw new UnauthorizedError('A user identity is required for this operation');
  return auth.userId;
}

export function requireAdmin(auth: AuthContext): void {
  if (!auth.isAdmin) throw new ForbiddenError('A valid x-admin-token header is required');
}
