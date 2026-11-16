// Real users on the Neon test branch: sign up through Neon Auth, then fetch the user's JWT exactly as
// the browser SDK does (session cookie -> /token). Tokens are verified by the API against the JWKS.
import request from 'supertest';
import type express from 'express';
import { db } from '../../server/db';

const ORIGIN = 'http://localhost:3000'; // localhost origins are trusted by Neon Auth by default
const PASSWORD = 'Test-password-12345!';

export interface TestUser {
  uid: string;
  email: string;
  name: string;
  token: string;
}

async function authFetch(path: string, init: RequestInit = {}) {
  const base = process.env.NEON_AUTH_BASE_URL as string;
  return fetch(`${base}${path}`, {
    ...init,
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}

export async function createUser(label: string): Promise<TestUser> {
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const name = `${label} tester`;
  const r = await authFetch('/sign-up/email', {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD, name }),
  });
  if (!r.ok) throw new Error(`Neon Auth sign-up failed: HTTP ${r.status} ${await r.text()}`);
  const body = (await r.json()) as { user: { id: string } };
  const cookie = r.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const t = await authFetch('/token', { headers: { Cookie: cookie } });
  if (!t.ok) throw new Error(`Neon Auth /token failed: HTTP ${t.status}`);
  const { token } = (await t.json()) as { token: string };
  return { uid: body.user.id, email, name, token };
}

/** Signs an existing user in again (new session, new JWT). */
export async function signIn(email: string): Promise<string> {
  const r = await authFetch('/sign-in/email', { method: 'POST', body: JSON.stringify({ email, password: PASSWORD }) });
  if (!r.ok) throw new Error(`Neon Auth sign-in failed: HTTP ${r.status}`);
  const cookie = r.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const t = await authFetch('/token', { headers: { Cookie: cookie } });
  return ((await t.json()) as { token: string }).token;
}

export const as = (app: express.Express, u: { token: string }) => ({
  get: (p: string) => request(app).get(p).set('authorization', `Bearer ${u.token}`),
  post: (p: string) => request(app).post(p).set('authorization', `Bearer ${u.token}`),
  put: (p: string) => request(app).put(p).set('authorization', `Bearer ${u.token}`),
  delete: (p: string) => request(app).delete(p).set('authorization', `Bearer ${u.token}`),
});

export async function addMember(workspaceId: string, uid: string, role: string) {
  await db().query(
    `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [workspaceId, uid, role],
  );
}

export async function balanceOf(workspaceId: string): Promise<number> {
  return Number(
    (await db().query('SELECT credits_remaining FROM workspaces WHERE id = $1', [workspaceId])).rows[0]
      .credits_remaining,
  );
}

export async function ledgerSum(workspaceId: string) {
  const r = await db().query(
    'SELECT coalesce(sum(amount_credits), 0)::bigint AS sum, count(*)::int AS count FROM ledger_entries WHERE workspace_id = $1',
    [workspaceId],
  );
  return { sum: Number(r.rows[0].sum), count: r.rows[0].count as number };
}
