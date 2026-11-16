// Pricing and credits end to end against Postgres + Neon Auth on the Neon test branch.
// Run with: npm run test:db
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../server/app';
import { closeDb, db } from '../../server/db';
import { addMember, as as asUser, balanceOf, createUser, ledgerSum, type TestUser } from './helpers';
import { grantCredits, refundCredits, reserveCredits } from '../../server/credits';
import type { AiClient } from '../../server/ai';

// Fake Gemini: behaviour switchable per test; counts calls.
let mode: 'ok' | 'fail' = 'ok';
let aiCalls = 0;
const okPost = JSON.stringify({ caption: 'Hi', hashtags: ['#a'], imagePrompt: 'p', visualDirection: 'v' });
const ai: AiClient = {
  models: {
    async generateContent(call) {
      aiCalls++;
      if (mode === 'fail') throw new Error('upstream down');
      const sys = String(call.config?.systemInstruction ?? '');
      if (/repl/i.test(sys))
        return {
          text: JSON.stringify({ sentiment: 'positive', suggestedReplies: ['ok'], suggestedAction: 'approve' }),
        };
      return { text: okPost };
    },
  },
};
const app = createApp({ ai });

const user = (label: string) => createUser(label);
type U = TestUser;
const as = (u: U) => asUser(app, u);

let owner: U;
let viewer: U;
let WS: string;

beforeAll(async () => {
  owner = await user('owner');
  viewer = await user('viewer');
  const r = await as(owner).post('/api/workspaces').send({ name: 'Pricing Co' });
  expect(r.status).toBe(201);
  WS = r.body.workspace.id;
  await addMember(WS, viewer.uid, 'viewer');
});
afterAll(() => closeDb());

describe('pricing and credits (Postgres + Neon Auth)', () => {
  it('new workspace: NEW_WORKSPACE_CREDITS granted with a matching ledger entry', async () => {
    expect(await balanceOf(WS)).toBe(40);
    const ledger = await as(owner).get('/api/billing/ledger').set('x-workspace-id', WS);
    expect(ledger.body.entries).toEqual([
      expect.objectContaining({ type: 'grant', amountCredits: 40, resultingBalance: 40 }),
    ]);
    expect((await ledgerSum(WS)).sum).toBe(40);
  });

  it('charges 15 per real generation and records a reservation', async () => {
    mode = 'ok';
    const r = await as(owner).post('/api/generate').send({ workspaceId: WS, prompt: 'Launch' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sample: false, costCredits: 15, newBalance: 25 });
    expect(await balanceOf(WS)).toBe(25);
  });

  it('refunds on AI failure, exactly once', async () => {
    mode = 'fail';
    const r = await as(owner).post('/api/generate').send({ workspaceId: WS, prompt: 'Launch' });
    expect(r.status).toBe(502);
    expect(r.body).toMatchObject({ refunded: true, newBalance: 25 });
    const { rows } = await db().query(
      `SELECT id, reservation_id FROM ledger_entries WHERE workspace_id = $1 AND type = 'refund'`,
      [WS],
    );
    expect(rows).toHaveLength(1);
    const reservationId = rows[0].reservation_id as string;
    expect(rows[0].id).toBe(`refund-${reservationId}`);
    // A retried refund is a no-op, even when 8 retries race each other.
    const retries = await Promise.all(Array.from({ length: 8 }, () => refundCredits(owner.uid, WS, 15, reservationId)));
    expect(retries.every((r) => r.alreadyRefunded && r.newBalance === 25)).toBe(true);
    expect(await balanceOf(WS)).toBe(25);
    // A refund that does not match the reservation is refused.
    await expect(refundCredits(owner.uid, WS, 16, reservationId)).rejects.toMatchObject({ status: 400 });
  });

  it('meters AI assists (5 credits) and refunds them on failure', async () => {
    mode = 'ok';
    const ok = await as(owner)
      .post('/api/engagement/suggest-reply')
      .set('x-workspace-id', WS)
      .send({ commentText: 'Love it' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ costCredits: 5, newBalance: 20 });
    mode = 'fail';
    const bad = await as(owner).post('/api/trends').set('x-workspace-id', WS).send({});
    expect(bad.status).toBe(502);
    expect(bad.body).toMatchObject({ refunded: true, newBalance: 20 });
    expect(await balanceOf(WS)).toBe(20);
  });

  it('returns 402 without calling the AI when the balance is short', async () => {
    mode = 'ok';
    await reserveCredits(owner.uid, WS, 10); // balance 10 < 15
    const before = aiCalls;
    const r = await as(owner).post('/api/generate').send({ workspaceId: WS, prompt: 'Launch' });
    expect(r.status).toBe(402);
    expect(r.body.error).toBe('INSUFFICIENT_CREDITS');
    expect(aiCalls).toBe(before);
    expect(await balanceOf(WS)).toBe(10);
  });

  it('a parallel burst of 12 generations cannot overspend', async () => {
    mode = 'ok';
    await grantCredits(WS, 80, { reason: 'test top-up', type: 'topup', idempotencyKey: `burst-${WS}` }); // 90
    const results = await Promise.all(
      Array.from({ length: 12 }, () => as(owner).post('/api/generate').send({ workspaceId: WS, prompt: 'Burst' })),
    );
    const ok = results.filter((r) => r.status === 200).length;
    expect(ok).toBe(6); // 6 x 15 = 90
    expect(results.filter((r) => r.status === 402)).toHaveLength(6);
    expect(await balanceOf(WS)).toBe(0);
  });

  it('grants are idempotent per key', async () => {
    const again = await grantCredits(WS, 80, { reason: 'test top-up', type: 'topup', idempotencyKey: `burst-${WS}` });
    expect(again.duplicate).toBe(true);
    expect(await balanceOf(WS)).toBe(0);
  });

  it('rejects negative, fractional, huge and string amounts', async () => {
    for (const amount of [-15, 0, 1.5, 1e9, Number.NaN, '15' as unknown as number]) {
      await expect(reserveCredits(owner.uid, WS, amount)).rejects.toMatchObject({ status: 400 });
      await expect(grantCredits(WS, amount, { reason: 'x' })).rejects.toMatchObject({ status: 400 });
    }
    expect(await balanceOf(WS)).toBe(0);
  });

  it('viewers cannot spend credits', async () => {
    await grantCredits(WS, 30, { reason: 'viewer test', idempotencyKey: `viewer-${WS}` });
    mode = 'ok';
    const g = await as(viewer).post('/api/generate').send({ workspaceId: WS, prompt: 'x' });
    expect(g.status).toBe(403);
    expect(g.body.error).toBe('ROLE_REQUIRED');
    const t = await as(viewer).post('/api/trends').set('x-workspace-id', WS).send({});
    expect(t.status).toBe(403);
    expect(await balanceOf(WS)).toBe(30);
    // Viewers can still read the balance.
    expect((await as(viewer).get('/api/billing/credits/check').set('x-workspace-id', WS)).body.creditsRemaining).toBe(
      30,
    );
  });

  it('no HTTP endpoint spends or grants credits directly', async () => {
    for (const path of ['/api/billing/credits/reserve', '/api/billing/credits/grant', '/api/billing/topup']) {
      expect((await as(owner).post(path).send({ workspaceId: WS, amountCredits: 5 })).status).toBe(404);
    }
    expect(await balanceOf(WS)).toBe(30);
  });

  it('a parallel burst of 30 direct reservations on 100 credits gives exactly 6 x 15 and balance 10', async () => {
    const r = await db().query(
      `INSERT INTO workspaces (id, name, slug, owner_id, credits_remaining, total_credits_allocated)
       VALUES ($1, 'Burst', 'burst', $2, 100, 100) RETURNING id`,
      [`ws-burst-${Date.now()}`, owner.uid],
    );
    const id = r.rows[0].id as string;
    await addMember(id, owner.uid, 'owner');
    await db().query(
      `INSERT INTO ledger_entries (id, workspace_id, user_id, type, amount_credits, resulting_balance)
       VALUES ($1, $2, 'test', 'grant', 100, 100)`,
      [`grant-${id}`, id],
    );
    const results = await Promise.allSettled(Array.from({ length: 30 }, () => reserveCredits(owner.uid, id, 15)));
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(6);
    const rejected = results.filter((x) => x.status === 'rejected') as PromiseRejectedResult[];
    expect(rejected.every((x) => x.reason.status === 402)).toBe(true);
    expect(await balanceOf(id)).toBe(10);
    const balances = results
      .filter((x) => x.status === 'fulfilled')
      .map((x) => (x as PromiseFulfilledResult<{ newBalance: number }>).value.newBalance)
      .sort((a, b) => b - a);
    expect(balances).toEqual([85, 70, 55, 40, 25, 10]);
    expect(await ledgerSum(id)).toEqual({ sum: 10, count: 7 });
  });

  it('the database itself refuses a negative balance', async () => {
    await expect(db().query('UPDATE workspaces SET credits_remaining = -1 WHERE id = $1', [WS])).rejects.toThrow(
      /check constraint/,
    );
  });

  it('the ledger reconciles with the balance after all of the above', async () => {
    const { sum, count } = await ledgerSum(WS);
    expect(count).toBeGreaterThan(10);
    expect(sum).toBe(await balanceOf(WS));
  });

  it('enforces MAX_WORKSPACES_PER_USER under a parallel burst', async () => {
    const u = await user('burst');
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        as(u)
          .post('/api/workspaces')
          .send({ name: `W${i}` }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    const owned = await db().query('SELECT count(*)::int AS n FROM workspaces WHERE owner_id = $1', [u.uid]);
    expect(owned.rows[0].n).toBe(3);
  });
});
