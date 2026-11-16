import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { creditPacks, verifyStripeEvent } from '../../server/payments';

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
