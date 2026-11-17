// Plan member limits against Postgres: invitations, acceptance, downgrade behaviour, removing members.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../server/app';
import { closeDb, db } from '../../server/db';
import { addMember, as as asUser, createUser, type TestUser } from './helpers';

const app = createApp({ ai: null });
const as = (u: TestUser) => asUser(app, u);
let owner: TestUser, admin: TestUser, joiner: TestUser, late: TestUser;
let WS: string;
const invite = (email: string) => as(owner).post(`/api/workspaces/${WS}/invites`).send({ email, role: 'creator' });
const tokenOf = (url: string) => url.split('#invite=')[1];

beforeAll(async () => {
  [owner, admin, joiner, late] = await Promise.all(
    ['owner', 'admin', 'joiner', 'late'].map((l) => createUser(`seat-${l}`)),
  );
  WS = (await as(owner).post('/api/workspaces').send({ name: 'Seats Co' })).body.workspace.id; // starter: 3 seats
  await addMember(WS, admin.uid, 'admin');
});
afterAll(() => closeDb());

describe('plan member limits', () => {
  it('Starter: owner + admin + one invitation fills the 3 seats; a 4th invitation is refused', async () => {
    const first = await invite(joiner.email);
    expect(first.status).toBe(201);
    const list = await as(owner).get(`/api/workspaces/${WS}/invites`);
    expect(list.body.seats).toMatchObject({ plan: 'starter', limit: 3, members: 2, pendingInvites: 1 });
    const second = await invite(late.email);
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('MEMBER_LIMIT');
    // Accepting the open invitation still works (members 2 -> 3).
    expect(
      (
        await as(joiner)
          .post('/api/invites/accept')
          .send({ token: tokenOf(first.body.inviteUrl) })
      ).status,
    ).toBe(200);
  });

  it('an invitation sent before a downgrade cannot be accepted once the workspace is full', async () => {
    await db().query("UPDATE workspaces SET plan = 'professional' WHERE id = $1", [WS]);
    const inv = await invite(late.email);
    expect(inv.status).toBe(201);
    await db().query("UPDATE workspaces SET plan = 'starter' WHERE id = $1", [WS]);
    const accept = await as(late)
      .post('/api/invites/accept')
      .send({ token: tokenOf(inv.body.inviteUrl) });
    expect(accept.status).toBe(409);
    expect(accept.body.error).toBe('MEMBER_LIMIT');
    // Nobody was removed by the downgrade.
    expect(
      (await db().query('SELECT count(*)::int AS n FROM workspace_members WHERE workspace_id = $1', [WS])).rows[0].n,
    ).toBe(3);
    // Removing a member frees the seat; then the same link works.
    expect((await as(admin).delete(`/api/workspaces/${WS}/members/${owner.uid}`)).status).toBe(400);
    expect((await as(joiner).delete(`/api/workspaces/${WS}/members/${admin.uid}`)).status).toBe(403);
    expect((await as(admin).delete(`/api/workspaces/${WS}/members/${joiner.uid}`)).status).toBe(200);
    expect(
      (
        await as(late)
          .post('/api/invites/accept')
          .send({ token: tokenOf(inv.body.inviteUrl) })
      ).status,
    ).toBe(200);
  });

  it('only the owner can remove an admin; an active subscription plan raises the limit', async () => {
    const other = await createUser('seat-admin2');
    await addMember(WS, other.uid, 'admin');
    expect((await as(admin).delete(`/api/workspaces/${WS}/members/${other.uid}`)).body.error).toBe('ROLE_REQUIRED');
    expect((await as(owner).delete(`/api/workspaces/${WS}/members/${other.uid}`)).status).toBe(200);
    await db().query(
      `INSERT INTO workspace_subscriptions (workspace_id, stripe_customer_id, stripe_subscription_id, plan, status)
       VALUES ($1, 'cus_seat', $2, 'professional', 'active')`,
      [WS, `sub_seat_${Date.now()}`],
    );
    expect((await as(owner).get(`/api/workspaces/${WS}/invites`)).body.seats).toMatchObject({
      plan: 'professional',
      limit: 10,
    });
  });
});
