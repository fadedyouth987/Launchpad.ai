/**
 * Credit top-ups with Stripe Checkout (hosted payment page; no card data touches Launchpad).
 * Turned on by STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET. Credits are added ONLY by the signed
 * webhook (checkout.session.completed / async_payment_succeeded with payment_status "paid"), never
 * by the browser returning from Checkout, and each Checkout session credits at most once.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiError } from './errors';

export interface CreditPack {
  credits: number;
  /** Price in the smallest currency unit (cents). */
  amount: number;
}

const DEFAULT_PACKS = '500:1900,1500:4900,5000:14900';

export const paymentsEnabled = () =>
  Boolean(process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_WEBHOOK_SECRET?.trim());
export const paymentCurrency = () => (process.env.STRIPE_CURRENCY || 'usd').toLowerCase();

/** CREDIT_PACKS="credits:priceInCents,..." (default 500:1900,1500:4900,5000:14900). */
export function creditPacks(raw = process.env.CREDIT_PACKS || DEFAULT_PACKS): CreditPack[] {
  const packs = raw
    .split(',')
    .map((p) => p.trim().split(':').map(Number))
    .filter(([c, a]) => Number.isSafeInteger(c) && c > 0 && c <= 1_000_000 && Number.isSafeInteger(a) && a >= 50)
    .map(([credits, amount]) => ({ credits, amount }));
  return packs.length ? packs : creditPacks(DEFAULT_PACKS);
}

/** Where Checkout sends the buyer back: PUBLIC_APP_URL, else the first ALLOWED_ORIGINS entry. */
export function appUrl(): string {
  const explicit = process.env.PUBLIC_APP_URL?.trim();
  const first = (process.env.ALLOWED_ORIGINS || '').split(',')[0]?.trim();
  return (explicit || first || 'http://localhost:3000').replace(/\/+$/, '');
}

export async function createCheckoutSession(
  opts: { workspaceId: string; workspaceName: string; uid: string; email?: string; pack: CreditPack },
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ id: string; url: string }> {
  const form = new URLSearchParams();
  const base = appUrl();
  form.set('mode', 'payment');
  form.set('success_url', `${base}/?checkout=success&session_id={CHECKOUT_SESSION_ID}#billing`);
  form.set('cancel_url', `${base}/?checkout=cancelled#billing`);
  form.set('client_reference_id', opts.workspaceId);
  form.set('line_items[0][quantity]', '1');
  form.set('line_items[0][price_data][currency]', paymentCurrency());
  form.set('line_items[0][price_data][unit_amount]', String(opts.pack.amount));
  form.set(
    'line_items[0][price_data][product_data][name]',
    `${opts.pack.credits.toLocaleString('en-US')} Launchpad credits`,
  );
  form.set('line_items[0][price_data][product_data][description]', `Credits for workspace "${opts.workspaceName}"`);
  for (const [k, v] of Object.entries({
    workspace_id: opts.workspaceId,
    credits: String(opts.pack.credits),
    uid: opts.uid,
  })) {
    form.set(`metadata[${k}]`, v);
  }
  if (opts.email) form.set('customer_email', opts.email);
  const res = await fetchImpl('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
      'idempotency-key': `checkout-${opts.workspaceId}-${opts.uid}-${opts.pack.credits}-${Math.floor(Date.now() / 10_000)}`,
    },
    body: form.toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => null)) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  } | null;
  if (!res.ok || !body?.url || !body.id) {
    console.error('[payments] Stripe checkout failed:', res.status, body?.error?.message?.slice(0, 200));
    throw new ApiError(502, 'CHECKOUT_FAILED', 'Could not start the Stripe checkout. Please try again.');
  }
  return { id: body.id, url: body.url };
}

/**
 * Verifies a Stripe-Signature header (v1 = HMAC-SHA256(secret, `${t}.${payload}`)) with a 5-minute
 * tolerance. Returns the parsed event or throws.
 */
export function verifyStripeEvent(
  payload: Buffer | string,
  header: string | undefined,
  secret = process.env.STRIPE_WEBHOOK_SECRET || '',
  nowSec = Math.floor(Date.now() / 1000),
  toleranceSec = 300,
): { id: string; type: string; data: { object: Record<string, unknown> } } {
  if (!secret) throw new Error('webhook secret not configured');
  if (!header) throw new Error('missing Stripe-Signature');
  const parts = header.split(',').map((p) => p.split('=') as [string, string]);
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!Number.isFinite(t) || !sigs.length) throw new Error('malformed Stripe-Signature');
  if (Math.abs(nowSec - t) > toleranceSec) throw new Error('timestamp outside tolerance');
  const raw = typeof payload === 'string' ? payload : payload.toString('utf8');
  const expected = createHmac('sha256', secret).update(`${t}.${raw}`).digest();
  const ok = sigs.some((s) => {
    const got = Buffer.from(s, 'hex');
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
  if (!ok) throw new Error('signature mismatch');
  return JSON.parse(raw);
}
