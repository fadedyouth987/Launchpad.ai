import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { creditPacks, verifyStripeEvent } from '../../server/payments';
import { creditsForInvoice, plans } from '../../server/subscriptions';

const SECRET = 'whsec_test_secret';
const sign = (payload: string, t: number, secret = SECRET) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`;

describe('Stripe webhook signatures', () => {
  const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: {} } });
  const now = 1_800_000_000;
  it('accepts a valid signature (also among several v1 values)', () => {
    expect(verifyStripeEvent(payload, sign(payload, now), SECRET, now).id).toBe('evt_1');
    const multi = `${sign(payload, now, 'other')},${sign(payload, now).split(',')[1]}`;
    expect(verifyStripeEvent(payload, multi, SECRET, now).type).toBe('checkout.session.completed');
  });
  it('rejects wrong secret, tampered body, old timestamps and missing headers', () => {
    expect(() => verifyStripeEvent(payload, sign(payload, now, 'nope'), SECRET, now)).toThrow(/mismatch/);
    expect(() => verifyStripeEvent(payload.replace('evt_1', 'evt_2'), sign(payload, now), SECRET, now)).toThrow();
    expect(() => verifyStripeEvent(payload, sign(payload, now - 1000), SECRET, now)).toThrow(/tolerance/);
    expect(() => verifyStripeEvent(payload, undefined, SECRET, now)).toThrow(/missing/);
    expect(() => verifyStripeEvent(payload, 'garbage', SECRET, now)).toThrow(/malformed/);
  });
});

describe('credit packs', () => {
  it('parses CREDIT_PACKS and falls back to defaults on junk', () => {
    expect(creditPacks('100:500,200:900')).toEqual([
      { credits: 100, amount: 500 },
      { credits: 200, amount: 900 },
    ]);
    expect(creditPacks('junk').map((p) => p.credits)).toEqual([500, 1500, 5000]);
  });
});

describe('plan subscriptions', () => {
  it('parses PLAN_PRICES in plan order and falls back to defaults on junk', () => {
    expect(plans('enterprise:100000:20000,starter:1000:50,bogus:1:1')).toEqual([
      { id: 'starter', name: 'Starter', amount: 1000, credits: 50 },
      { id: 'enterprise', name: 'Enterprise', amount: 100000, credits: 20000 },
    ]);
    expect(plans('junk').map((p) => [p.id, p.amount, p.credits])).toEqual([
      ['starter', 9900, 1000],
      ['professional', 29900, 3000],
      ['enterprise', 89900, 10000],
    ]);
  });

  const meta = { workspace_id: 'ws_1', plan: 'professional', upgrade_credits: '2000' };
  const inv = (extra: Record<string, unknown>) => ({ id: 'in_1', currency: 'usd', amount_paid: 29900, ...extra });

  it('first and renewal invoices add the plan credits (old and new Stripe invoice shapes)', () => {
    const newShape = creditsForInvoice(
      inv({ billing_reason: 'subscription_create', parent: { subscription_details: { metadata: meta } } }),
    );
    expect(newShape).toMatchObject({ workspaceId: 'ws_1', credits: 3000 });
    const oldShape = creditsForInvoice(
      inv({ billing_reason: 'subscription_cycle', subscription_details: { metadata: meta } }),
    );
    expect(oldShape.credits).toBe(3000);
  });

  it('a paid upgrade adds the difference; downgrades, other reasons, foreign invoices and wrong currency add nothing', () => {
    const p = { parent: { subscription_details: { metadata: meta } } };
    expect(creditsForInvoice(inv({ ...p, billing_reason: 'subscription_update' })).credits).toBe(2000);
    expect(creditsForInvoice(inv({ ...p, billing_reason: 'subscription_update', amount_paid: 0 })).credits).toBe(0);
    expect(creditsForInvoice(inv({ ...p, billing_reason: 'manual' })).credits).toBe(0);
    expect(creditsForInvoice(inv({ ...p, billing_reason: 'subscription_cycle', currency: 'eur' })).credits).toBe(0);
    expect(creditsForInvoice(inv({ billing_reason: 'subscription_cycle' })).reason).toBe('NO_LAUNCHPAD_METADATA');
    // upgrade_credits can never exceed the plan's own monthly credits
    const huge = { parent: { subscription_details: { metadata: { ...meta, upgrade_credits: '999999' } } } };
    expect(creditsForInvoice(inv({ ...huge, billing_reason: 'subscription_update' })).credits).toBe(3000);
  });

  it('upgrade credits are prorated by the share of the price difference actually paid', () => {
    // Starter -> Professional: 20000 cents a month more, 2000 extra credits a month.
    const m = { ...meta, upgrade_price_diff: '20000' };
    const p = { parent: { subscription_details: { metadata: m } } };
    const up = (paid: number) =>
      creditsForInvoice(inv({ ...p, billing_reason: 'subscription_update', amount_paid: paid }));
    expect(up(20000).credits).toBe(2000); // the whole month
    expect(up(5000).credits).toBe(500); // a quarter of the month left
    expect(up(100).credits).toBe(10); // last day: a few dollars buy only a few credits
    expect(up(50000).credits).toBe(2000); // never more than the full difference
  });
});
