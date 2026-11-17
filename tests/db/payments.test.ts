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
  const u = String(url);
  if (u.endsWith('/v1/products')) return Response.json({ id: 'launchpad_plan_x' });
  if (u.includes('/v1/billing_portal/sessions'))
    return Response.json({ url: 'https://billing.stripe.com/p/session/x' });
  if (u.includes('/v1/subscriptions/')) return Response.json({ id: 'sub_x', items: { data: [{ id: 'si_test_1' }] } });
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
    expect((await signed({ ...session(`${id}_z`), type: 'invoice.paid' })).body.credited).toBe(false);
    expect(await balanceOf(WS)).toBe(before + 1500);
  });
});

describe('Stripe plan subscriptions', () => {
  const subId = `sub_test_${Date.now()}`;
  const subEvent = (type: string, created: number, sub: Record<string, unknown>) => ({
    id: `evt_${type}_${created}`,
    type,
    created,
    data: {
      object: {
        id: subId,
        customer: 'cus_test_1',
        status: 'active',
        cancel_at_period_end: false,
        items: { data: [{ id: 'si_test_1', current_period_end: 1_900_000_000 }] },
        metadata: { workspace_id: WS, plan: 'starter', uid: owner.uid },
        ...sub,
      },
    },
  });
  const invoice = (id: string, billing_reason: string, metadata: Record<string, string>, amount_paid = 9900) => ({
    id: `evt_${id}`,
    type: 'invoice.paid',
    data: {
      object: {
        id,
        billing_reason,
        currency: 'usd',
        amount_paid,
        parent: { subscription_details: { subscription: subId, metadata: { workspace_id: WS, ...metadata } } },
      },
    },
  });
  const subOf = async (u: TestUser) => (await as(u).get(`/api/workspaces/${WS}/subscription`)).body.subscription;

  it('lists plans; only owners/admins can subscribe; a workspace without a subscription gets Checkout', async () => {
    const p = await request(app).get('/api/billing/plans');
    expect(p.body.plans.map((x: { id: string }) => x.id)).toEqual(['starter', 'professional', 'enterprise']);
    expect(await subOf(creator)).toBeNull();
    expect((await as(creator).post('/api/billing/subscribe').send({ workspaceId: WS, plan: 'starter' })).status).toBe(
      403,
    );
    expect((await as(owner).post('/api/billing/subscribe').send({ workspaceId: WS, plan: 'gold' })).status).toBe(400);
    expect((await as(owner).post('/api/billing/portal').send({ workspaceId: WS })).status).toBe(404);
    const r = await as(owner).post('/api/billing/subscribe').send({ workspaceId: WS, plan: 'starter' });
    expect(r.status).toBe(200);
    expect(r.body.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const call = stripeCalls.at(-1)!;
    expect(call.body.get('mode')).toBe('subscription');
    expect(call.body.get('line_items[0][price_data][product]')).toBe('launchpad_plan_starter');
    expect(call.body.get('line_items[0][price_data][unit_amount]')).toBe('9900');
    expect(call.body.get('line_items[0][price_data][recurring][interval]')).toBe('month');
    expect(call.body.get('subscription_data[metadata][workspace_id]')).toBe(WS);
    // A completed subscription checkout is not treated as a credit-pack purchase.
    const done = await signed({ ...session('cs_sub_1', { mode: 'subscription', metadata: { workspace_id: WS } }) });
    expect(done.body.ignored).toBe('subscription_checkout');
  });

  it('subscription events sync the plan; stale events are ignored; invoices credit once', async () => {
    const t = Math.floor(Date.now() / 1000);
    expect((await signed(subEvent('customer.subscription.created', t, {}))).body).toMatchObject({ status: 'active' });
    expect(await subOf(creator)).toMatchObject({ plan: 'starter', active: true, cancelAtPeriodEnd: false });
    expect((await db().query('SELECT plan FROM workspaces WHERE id = $1', [WS])).rows[0].plan).toBe('starter');

    const before = await balanceOf(WS);
    const first = await signed(invoice(`in_create_${t}`, 'subscription_create', { plan: 'starter' }));
    expect(first.body).toMatchObject({ credited: true });
    expect((await signed(invoice(`in_create_${t}`, 'subscription_create', { plan: 'starter' }))).body.duplicate).toBe(
      true,
    );
    expect(await balanceOf(WS)).toBe(before + 1000);
    const renewal = await signed(invoice(`in_cycle_${t}`, 'subscription_cycle', { plan: 'starter' }));
    expect(renewal.body.credited).toBe(true);
    expect(await balanceOf(WS)).toBe(before + 2000);

    // An older event arriving late does not overwrite newer state.
    const stale = await signed(subEvent('customer.subscription.updated', t - 100, { status: 'past_due' }));
    expect(stale.body.ignored).toBe('STALE_EVENT');
    expect((await subOf(owner)).status).toBe('active');
  });

  it('switching plan updates the Stripe subscription in place; a paid upgrade adds the difference once', async () => {
    expect((await as(owner).post('/api/billing/subscribe').send({ workspaceId: WS, plan: 'starter' })).status).toBe(
      409,
    );
    const r = await as(owner).post('/api/billing/subscribe').send({ workspaceId: WS, plan: 'professional' });
    expect(r.body).toMatchObject({ changed: true, plan: 'professional' });
    const call = stripeCalls.at(-1)!;
    expect(call.url).toBe(`https://api.stripe.com/v1/subscriptions/${subId}`);
    expect(call.body.get('items[0][id]')).toBe('si_test_1');
    expect(call.body.get('items[0][price_data][unit_amount]')).toBe('29900');
    expect(call.body.get('proration_behavior')).toBe('always_invoice');
    expect(call.body.get('metadata[upgrade_credits]')).toBe('2000');

    const t = Math.floor(Date.now() / 1000) + 10;
    await signed(
      subEvent('customer.subscription.updated', t, { metadata: { workspace_id: WS, plan: 'professional' } }),
    );
    expect((await subOf(owner)).plan).toBe('professional');
    const before = await balanceOf(WS);
    const meta = { plan: 'professional', upgrade_credits: '2000' };
    expect((await signed(invoice(`in_up_${t}`, 'subscription_update', meta, 20000))).body.credited).toBe(true);
    expect((await signed(invoice(`in_up_${t}`, 'subscription_update', meta, 20000))).body.duplicate).toBe(true);
    expect((await signed(invoice(`in_dn_${t}`, 'subscription_update', meta, 0))).body.credited).toBe(false);
    expect(await balanceOf(WS)).toBe(before + 2000);
  });

  it('billing portal opens for owners; cancellation marks the subscription inactive', async () => {
    const portal = await as(owner).post('/api/billing/portal').send({ workspaceId: WS });
    expect(portal.body.url).toMatch(/^https:\/\/billing\.stripe\.com\//);
    expect(stripeCalls.at(-1)!.body.get('customer')).toBe('cus_test_1');
    expect((await as(creator).post('/api/billing/portal').send({ workspaceId: WS })).status).toBe(403);

    const t = Math.floor(Date.now() / 1000) + 20;
    await signed(
      subEvent('customer.subscription.deleted', t, {
        status: 'canceled',
        metadata: { workspace_id: WS, plan: 'professional' },
      }),
    );
    expect(await subOf(owner)).toMatchObject({ status: 'canceled', active: false });
    // With no active subscription, choosing a plan starts a new Checkout for the same Stripe customer.
    const again = await as(owner).post('/api/billing/subscribe').send({ workspaceId: WS, plan: 'enterprise' });
    expect(again.body.url).toBeTruthy();
    expect(stripeCalls.at(-1)!.body.get('customer')).toBe('cus_test_1');
  });
});
