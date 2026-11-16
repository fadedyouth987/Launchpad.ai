// Stripe Checkout + webhook against Postgres: owner-only checkout, signed webhook credits exactly once.
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app';
import { closeDb, db } from '../../server/db';
import { addMember, as as asUser, balanceOf, createUser, type TestUser } from './helpers';

vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake_key_for_tests');
vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_db_secret');
vi.stubEnv('PUBLIC_APP_URL', 'https://app.example.com');

const stripeCalls: Array<{ url: string; body: URLSearchParams; auth: string | null }> = [];
const stripeFetch = (async (url: string | URL, init: RequestInit = {}) => {
  stripeCalls.push({
    url: String(url),
    body: new URLSearchParams(String(init.body)),
    auth: new Headers(init.headers).get('authorization'),
  });
  return Response.json({ id: 'cs_test_123', url: 'https://checkout.stripe.com/c/pay/cs_test_123' });
}) as typeof fetch;

const app = createApp({ ai: null, paymentsFetch: stripeFetch });
const as = (u: TestUser) => asUser(app, u);
let owner: TestUser, creator: TestUser;
let WS: string;

const signed = (event: unknown) => {
  const payload = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', 'whsec_test_db_secret').update(`${t}.${payload}`).digest('hex');
  return request(app)
    .post('/api/billing/stripe/webhook')
    .set('content-type', 'application/json')
    .set('stripe-signature', `t=${t},v1=${sig}`)
    .send(payload);
};
const session = (id: string, extra: Record<string, unknown> = {}) => ({
  id: `evt_${id}`,
  type: 'checkout.session.completed',
  data: {
    object: {
      id,
      payment_status: 'paid',
      amount_total: 4900,
      currency: 'usd',
      metadata: { workspace_id: WS, credits: '1500', uid: owner.uid },
      ...extra,
    },
  },
});

beforeAll(async () => {
  [owner, creator] = await Promise.all(['owner', 'creator'].map((l) => createUser(`pay-${l}`)));
  WS = (await as(owner).post('/api/workspaces').send({ name: 'Pay Co' })).body.workspace.id;
  await addMember(WS, creator.uid, 'creator');
});
afterAll(() => closeDb());

describe('Stripe payments', () => {
  it('packs are enabled; only owners/admins can start checkout', async () => {
    expect((await request(app).get('/api/billing/packs')).body.enabled).toBe(true);
    expect((await as(creator).post('/api/billing/checkout').send({ workspaceId: WS, credits: 1500 })).status).toBe(403);
    expect((await as(owner).post('/api/billing/checkout').send({ workspaceId: WS, credits: 7 })).status).toBe(400);
    const r = await as(owner).post('/api/billing/checkout').send({ workspaceId: WS, credits: 1500 });
    expect(r.status).toBe(200);
    expect(r.body.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const call = stripeCalls.at(-1)!;
    expect(call.url).toBe('https://api.stripe.com/v1/checkout/sessions');
    expect(call.auth).toBe('Bearer sk_test_fake_key_for_tests');
    expect(call.body.get('line_items[0][price_data][unit_amount]')).toBe('4900');
    expect(call.body.get('metadata[workspace_id]')).toBe(WS);
    expect(call.body.get('success_url')).toMatch(/^https:\/\/app\.example\.com\/\?checkout=success/);
  });

  it('rejects unsigned or badly signed webhooks', async () => {
    const r = await request(app).post('/api/billing/stripe/webhook').set('content-type', 'application/json').send('{}');
    expect(r.status).toBe(400);
    const bad = await request(app)
      .post('/api/billing/stripe/webhook')
      .set('stripe-signature', `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}`)
      .send('{}');
    expect(bad.status).toBe(400);
  });

  it('a paid session credits once (retries are no-ops); mismatched amounts and unpaid sessions credit nothing', async () => {
    const before = await balanceOf(WS);
    const id = `cs_test_${Date.now()}`;
    const first = await signed(session(id));
    expect(first.body).toMatchObject({ received: true, credited: true });
    expect(await balanceOf(WS)).toBe(before + 1500);
    const retry = await signed(session(id));
    expect(retry.body).toMatchObject({ duplicate: true });
    expect(await balanceOf(WS)).toBe(before + 1500);
    const ledger = await db().query(`SELECT type, amount_credits FROM ledger_entries WHERE id = $1`, [
      `purchase-stripe_${id}`,
    ]);
    expect(ledger.rows[0]).toMatchObject({ type: 'purchase', amount_credits: 1500 });

    expect((await signed(session(`${id}_x`, { amount_total: 100 }))).body.error).toBe('AMOUNT_MISMATCH');
    expect((await signed(session(`${id}_y`, { payment_status: 'unpaid' }))).body.pending).toBe(true);
    expect((await signed({ ...session(`${id}_z`), type: 'invoice.paid' })).body.ignored).toBe('invoice.paid');
    expect(await balanceOf(WS)).toBe(before + 1500);
  });
});
