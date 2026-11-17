import type { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { DATABASE_CONFIGURED } from './db';

/**
 * Neon Auth (Managed Better Auth) sign-in for the API.
 *
 * The browser signs in against the branch's Neon Auth URL and sends its short-lived JWT (EdDSA,
 * 15 minutes) as `Authorization: Bearer <jwt>`. The server verifies the signature against
 * NEON_AUTH_JWKS_URL (keys cached by jose), the issuer and audience (the origin of
 * NEON_AUTH_BASE_URL), and the expiry. A valid token only proves who the caller is; every route still
 * checks workspace membership and role.
 */
export const DEMO_MODE = process.env.DEMO_MODE === 'true';
export const AUTH_CONFIGURED = Boolean(
  process.env.NEON_AUTH_JWKS_URL && process.env.NEON_AUTH_BASE_URL && DATABASE_CONFIGURED,
);

export interface AuthContext {
  uid: string;
  demo: boolean;
  email?: string;
  name?: string;
  /** Set when the caller used a workspace API key instead of a signed-in session. */
  apiKey?: { id: string; workspaceId: string; name: string; scopes: string[] };
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authContext?: AuthContext;
    }
  }
}

export const DEMO_UID = 'demo-user';

let jwks: JWTVerifyGetKey | null = null;
function keySet(): JWTVerifyGetKey {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL as string), {
      timeoutDuration: 5000,
      cooldownDuration: 30_000,
      cacheMaxAge: 10 * 60_000,
    });
  }
  return jwks;
}

/** Verifies a Neon Auth JWT. Throws on any problem. */
export async function verifyNeonAuthToken(token: string): Promise<AuthContext> {
  const origin = new URL(process.env.NEON_AUTH_BASE_URL as string).origin;
  const { payload } = await jwtVerify(token, keySet(), {
    issuer: origin,
    audience: origin,
    algorithms: ['EdDSA'],
    requiredClaims: ['sub', 'exp', 'iat'],
    clockTolerance: 5,
  });
  if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('token has no subject');
  if (payload.banned === true) throw new Error('user is banned');
  return {
    uid: payload.sub,
    demo: false,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    name: typeof payload.name === 'string' ? payload.name : undefined,
  };
}

/**
 * Requires a verified Neon Auth JWT in `Authorization: Bearer <token>`.
 * In DEMO_MODE (explicit opt-in) requests are attributed to a shared demo user instead.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (DEMO_MODE) {
    req.authContext = { uid: DEMO_UID, demo: true };
    return next();
  }

  if (!AUTH_CONFIGURED) {
    return res.status(503).json({
      error: 'AUTH_NOT_CONFIGURED',
      message:
        'Server authentication is not configured. Set DATABASE_URL, NEON_AUTH_BASE_URL and NEON_AUTH_JWKS_URL, or DEMO_MODE=true for local demos.',
    });
  }

  const header = req.get('authorization') || '';

  // Workspace API key (integrations). Acts as a hidden member of its workspace; limited endpoints.
  const keyMatch = /^Bearer\s+(lp_live_[A-Za-z0-9_-]{20,90})$/.exec(header);
  if (keyMatch) {
    try {
      const { authenticateKey, keyMayCall, keyMemberId } = await import('./apiKeys');
      const key = await authenticateKey(keyMatch[1]);
      if (!key)
        return res.status(401).json({ error: 'INVALID_API_KEY', message: 'API key is invalid, revoked or expired.' });
      if (!keyMayCall(req)) {
        return res.status(403).json({
          error: 'API_KEY_NOT_ALLOWED',
          message: 'API keys cannot call this endpoint. See the API docs for what keys can do.',
        });
      }
      req.authContext = { uid: keyMemberId(key.id), demo: false, name: `API key "${key.name}"`, apiKey: key };
      return next();
    } catch (err) {
      console.error('[auth] API key check failed:', (err as Error).message);
      return res.status(503).json({ error: 'AUTH_UNAVAILABLE', message: 'Could not check the API key. Try again.' });
    }
  }

  const match = /^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(header);
  if (!match) {
    return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Sign in required.' });
  }

  try {
    req.authContext = await verifyNeonAuthToken(match[1]);
    return next();
  } catch (err) {
    console.warn('[auth] token rejected:', (err as { code?: string })?.code ?? (err as Error)?.message);
    return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Sign in required.' });
  }
}
