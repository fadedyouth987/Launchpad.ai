// Team invitations: owner/admin only, token hashed at rest, email-matched acceptance, single use.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../server/app';
import { closeDb, db } from '../../server/db';
import { addMember, as as asUser, createUser, type TestUser } from './helpers';

vi.stubEnv('RESEND_API_KEY', 're_test_fake');
vi.stubEnv('EMAIL_FROM', 'Launchpad <team@example.com>');
vi.stubEnv('PUBLIC_APP_URL', 'https://app.example.com');

const mails: Array<Record<string, unknown>> = [];
const emailFetch = (async (_url: string | URL, init: RequestInit = {}) => {
  mails.push(JSON.parse(String(init.body)));
  return Response.json({ id: 'email_1' });
}) as typeof fetch;

const app = createApp({ ai: null, emailFetch });
const as = (u: TestUser) => asUser(app, u);
let owner: TestUser, creator: TestUser, invitee: TestUser, stranger: TestUser;
let WS: string;

beforeAll(async () => {
  [owner, creator, invitee, stranger] = await Promise.all(
    ['owner', 'creator', 'invitee', 'stranger'].map((l) => createUser(`inv-${l}`)),
  );
  WS = (await as(owner).post('/api/workspaces').send({ name: 'Invite Co' })).body.workspace.id;
  await addMember(WS, creator.uid, 'creator');
  // These tests are about the invitation flow, not seats: Starter's 3 seats would fill up by the third
  // invite (owner + creator + accepted invitee). Seat limits have their own tests (memberLimits).
  await db().query(`UPDATE workspaces SET plan = 'professional' WHERE id = $1`, [WS]);
});
afterAll(() => closeDb());

describe('invitations', () => {
  let token = '';
  it('creators cannot invite; owners can, and the invite is emailed with a fragment link', async () => {
    expect((await as(creator).post(`/api/workspaces/${WS}/invites`).send({ email: invitee.email })).status).toBe(403);
    const r = await as(owner)
      .post(`/api/workspaces/${WS}/invites`)
      .send({ email: invitee.email.toUpperCase(), role: 'approver' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ emailSent: true, invite: { email: invitee.email.toLowerCase(), role: 'approver' } });
    expect(r.body.inviteUrl).toMatch(/^https:\/\/app\.example\.com\/#invite=[A-Za-z0-9_-]{40,}$/);
    token = r.body.inviteUrl.split('#invite=')[1];
    expect(mails.at(-1)).toMatchObject({ to: [invitee.email.toLowerCase()], from: 'Launchpad <team@example.com>' });
    expect(String(mails.at(-1)!.text)).toContain(r.body.inviteUrl);
    const stored = await db().query('SELECT token_hash FROM workspace_invites WHERE workspace_id = $1', [WS]);
    expect(stored.rows[0].token_hash).not.toContain(token);
    const list = await as(owner).get(`/api/workspaces/${WS}/invites`);
    expect(list.body.invites).toHaveLength(1);
  });

  it('only the invited email can accept, once', async () => {
    const wrong = await as(stranger).post('/api/invites/accept').send({ token });
    expect(wrong.status).toBe(403);
    expect(wrong.body.error).toBe('INVITE_EMAIL_MISMATCH');
    const ok = await as(invitee).post('/api/invites/accept').send({ token });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ workspaceId: WS, role: 'approver' });
    const mine = await as(invitee).get('/api/me/workspaces');
    expect(mine.body.workspaces.map((w: { id: string }) => w.id)).toContain(WS);
    expect((await as(invitee).post('/api/invites/accept').send({ token })).status).toBe(404);
    expect(
      (
        await as(invitee)
          .post('/api/invites/accept')
          .send({ token: 'x'.repeat(43) })
      ).status,
    ).toBe(404);
  });

  it('revoked invites cannot be used', async () => {
    const r = await as(owner).post(`/api/workspaces/${WS}/invites`).send({ email: stranger.email, role: 'viewer' });
    expect(r.status).toBe(201);
    const t = r.body.inviteUrl.split('#invite=')[1];
    expect((await as(owner).delete(`/api/workspaces/${WS}/invites/${r.body.invite.id}`)).status).toBe(200);
    expect((await as(stranger).post('/api/invites/accept').send({ token: t })).status).toBe(404);
  });
});
