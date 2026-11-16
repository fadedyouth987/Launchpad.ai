import { createAuthClient } from '@neon/auth';
import { BetterAuthVanillaAdapter } from '@neon/auth/vanilla/adapters';

// Neon Auth (managed Better Auth). The browser talks to the Neon Auth endpoint directly; the session
// lives there and every API call carries a short-lived JWT (EdDSA, ~15 min) that the API verifies
// against the branch's JWKS. No database access ever happens from the browser.
export const NEON_AUTH_URL = (import.meta.env.VITE_NEON_AUTH_URL || '').replace(/\/+$/, '');

export interface AuthUser {
  uid: string;
  email: string;
  name: string;
  image: string | null;
}

const makeClient = (url: string) => createAuthClient(url, { adapter: BetterAuthVanillaAdapter() });
type AuthClient = ReturnType<typeof makeClient>;
let client: AuthClient | null = null;
function authClient(): AuthClient {
  if (!NEON_AUTH_URL) throw new AuthFailure('NOT_CONFIGURED', 'Sign-in is not configured (VITE_NEON_AUTH_URL).');
  client ??= makeClient(NEON_AUTH_URL);
  return client;
}

export class AuthFailure extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

type ErrorShape = {
  code?: string;
  message?: string;
  status?: number;
  error?: { code?: string; message?: string; status?: number };
  body?: { code?: string; message?: string };
};
type Result<T> = { data?: T | null; error?: ErrorShape | null };

/** The raw Better Auth code (e.g. INVALID_EMAIL_OR_PASSWORD) wherever the SDK put it. */
function toFailure(e: ErrorShape): AuthFailure {
  const code = e.error?.code || e.body?.code || e.code || 'AUTH_ERROR';
  const message = e.error?.message || e.body?.message || e.message || 'Authentication failed.';
  return new AuthFailure(code, message, e.status || e.error?.status || 0);
}

/** Better Auth returns { data, error } and the Neon adapter may also throw; normalise both. */
async function call<T>(fn: () => Promise<Result<T>>): Promise<T | null> {
  let r: Result<T>;
  try {
    r = await fn();
  } catch (err) {
    throw toFailure(err as ErrorShape);
  }
  if (r?.error) throw toFailure(r.error);
  return r?.data ?? null;
}

// ---- session state shared by AuthGate, AccountControls and apiFetch ----
type Listener = (user: AuthUser | null) => void;
const listeners = new Set<Listener>();
let current: AuthUser | null | undefined; // undefined = not loaded yet
let jwt: string | null = null;

function publish(user: AuthUser | null) {
  current = user;
  listeners.forEach((l) => l(user));
}

type SessionData = {
  user?: { id: string; email: string; name?: string | null; image?: string | null };
  session?: { token?: string };
};

/** Reads the session from Neon Auth (cached by the SDK until the JWT is about to expire). */
export async function refreshSession(): Promise<AuthUser | null> {
  if (!NEON_AUTH_URL) {
    jwt = null;
    publish(null);
    return null;
  }
  let data: SessionData | null = null;
  try {
    data = await call<SessionData>(() => authClient().getSession() as Promise<Result<SessionData>>);
  } catch {
    data = null; // auth endpoint unreachable or signed out: treat as signed out
  }
  const u = data?.user;
  jwt = data?.session?.token ?? null;
  const next = u ? { uid: u.id, email: u.email, name: u.name || u.email.split('@')[0], image: u.image ?? null } : null;
  if (next?.uid !== current?.uid || current === undefined || next?.name !== current?.name) publish(next);
  return next;
}

/** Subscribe to sign-in/sign-out. Calls back immediately once the first session read finishes. */
export function onAuthChange(listener: Listener): () => void {
  listeners.add(listener);
  if (current !== undefined) listener(current);
  else void refreshSession();
  return () => listeners.delete(listener);
}

/** JWT for the API (Authorization: Bearer). Refreshes through the SDK cache when it is near expiry. */
export async function getApiToken(): Promise<string | null> {
  if (!NEON_AUTH_URL) return null;
  const exp = jwt ? jwtExp(jwt) : 0;
  if (!jwt || exp * 1000 - Date.now() < 60_000) await refreshSession();
  return jwt;
}

function jwtExp(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp : 0;
  } catch {
    return 0;
  }
}

export async function signUpWithEmail(email: string, password: string, name: string) {
  await call(
    () => authClient().signUp.email({ email, password, name: name || email.split('@')[0] }) as Promise<Result<unknown>>,
  );
  return refreshSession();
}

export async function signInWithEmail(email: string, password: string) {
  await call(() => authClient().signIn.email({ email, password }) as Promise<Result<unknown>>);
  return refreshSession();
}

/** Redirects to Google and back to this page (the origin must be a trusted domain in Neon Auth). */
export async function signInWithGoogle() {
  await call(
    () =>
      authClient().signIn.social({ provider: 'google', callbackURL: window.location.href }) as Promise<Result<unknown>>,
  );
}

/** Sends a reset link that returns to this app at /?reset-password with a token. */
export async function resetPasswordEmail(email: string) {
  const redirectTo = `${window.location.origin}/?reset-password=1`;
  await call(() => authClient().requestPasswordReset({ email, redirectTo }) as Promise<Result<unknown>>);
}

export async function completePasswordReset(token: string, newPassword: string) {
  await call(() => authClient().resetPassword({ token, newPassword }) as Promise<Result<unknown>>);
}

export async function logoutUser() {
  try {
    await call(() => authClient().signOut() as Promise<Result<unknown>>);
  } finally {
    jwt = null;
    publish(null);
  }
}
