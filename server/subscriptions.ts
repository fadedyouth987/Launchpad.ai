/**
 * Monthly plan subscriptions with Stripe Billing (Checkout in "subscription" mode + Billing Portal).
 * Uses the same STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET as credit top-ups. Prices are defined here
 * (PLAN_PRICES), not in the Stripe dashboard: each plan is a Stripe Product with a fixed id
 * (launchpad_plan_<plan>) and inline monthly prices.
 *
 * State changes ONLY through the signed webhook:
 *   - customer.subscription.created/updated/deleted -> workspace_subscriptions row + workspaces.plan
 *   - invoice.paid (subscription_create / subscription_cycle) -> that plan's monthly credits, once per invoice
 *   - invoice.paid (subscription_update, i.e. an upgrade) -> the credit difference, once per invoice
 */
import { DEMO_MODE } from './auth';
import { db, withTx } from './db';
import { ApiError } from './errors';
import { appUrl, paymentCurrency } from './payments';
import type { Workspace } from '../src/types';

export type PlanId = Workspace['plan'];
export const PLAN_IDS: PlanId[] = ['starter', 'professional', 'enterprise'];

export interface Plan {
  id: PlanId;
  name: string;
  /** Monthly price in the smallest currency unit (cents). */
  amount: number;
  /** Credits added each paid month. */
  credits: number;
}

export const PLAN_NAMES: Record<PlanId, string> = {
  starter: 'Starter',
  professional: 'Professional',
  enterprise: 'Enterprise',
};
const NAMES = PLAN_NAMES;
const DEFAULT_PLANS = 'starter:9900:1000,professional:29900:3000,enterprise:89900:10000';

/** PLAN_PRICES="plan:priceInCents:monthlyCredits,..." (default starter 99/1000, professional 299/3000, enterprise 899/10000). */
export function plans(raw = process.env.PLAN_PRICES || DEFAULT_PLANS): Plan[] {
  const byId = new Map<PlanId, Plan>();
  for (const part of raw.split(',')) {
    const [id, a, c] = part.trim().split(':');
    const amount = Number(a);
    const credits = Number(c);
    if (!PLAN_IDS.includes(id as PlanId)) continue;
    if (!Number.isSafeInteger(amount) || amount < 50 || !Number.isSafeInteger(credits) || credits <= 0) continue;
    if (credits > 1_000_000) continue;
    byId.set(id as PlanId, { id: id as PlanId, name: NAMES[id as PlanId], amount, credits });
  }
  const list = PLAN_IDS.map((id) => byId.get(id)).filter((p): p is Plan => Boolean(p));
  return list.length ? list : plans(DEFAULT_PLANS);
}

export const findPlan = (id: unknown) => plans().find((p) => p.id === id);

export interface Subscription {
  plan: PlanId;
  status: string;
  active: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/** Statuses where the customer still has the plan (past_due = Stripe is retrying the card). */
export const ACTIVE_STATUSES = ['active', 'trialing', 'past_due'];
/** Statuses where the subscription is over for good. */
export const TERMINAL_STATUSES = ['canceled', 'incomplete_expired'];

// ---------------------------------------------------------------- Stripe API

type StripeObj = Record<string, unknown> & { error?: { message?: string; code?: string } };

async function stripe(
  method: 'GET' | 'POST',
  path: string,
  form: Record<string, string> | null,
  fetchImpl: typeof fetch = globalThis.fetch,
  idempotencyKey?: string,
): Promise<{ ok: boolean; status: number; body: StripeObj }> {
  const res = await fetchImpl(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    },
    ...(form ? { body: new URLSearchParams(form).toString() } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  const body = ((await res.json().catch(() => null)) ?? {}) as StripeObj;
  return { ok: res.ok, status: res.status, body };
}

const stripeFailed = (what: string, r: { status: number; body: StripeObj }) => {
  console.error(`[subscriptions] Stripe ${what} failed:`, r.status, r.body.error?.message?.slice(0, 200));
  return new ApiError(502, 'STRIPE_FAILED', 'Could not reach Stripe. Please try again.');
};

export const productId = (plan: PlanId) => `launchpad_plan_${plan}`;

/** Creates the plan's Stripe Product (fixed id) if it does not exist yet. */
async function ensureProduct(plan: Plan, fetchImpl?: typeof fetch) {
  const r = await stripe(
    'POST',
    'products',
    { id: productId(plan.id), name: `Launchpad ${plan.name} plan`, 'metadata[plan]': plan.id },
    fetchImpl,
  );
  if (r.ok || r.body.error?.code === 'resource_already_exists') return;
  throw stripeFailed('create product', r);
}

const priceData = (prefix: string, plan: Plan): Record<string, string> => ({
  [`${prefix}[currency]`]: paymentCurrency(),
  [`${prefix}[product]`]: productId(plan.id),
  [`${prefix}[unit_amount]`]: String(plan.amount),
  [`${prefix}[recurring][interval]`]: 'month',
});

/** Stripe Checkout for a new subscription. The browser is sent to the returned URL. */
export async function createSubscriptionCheckout(
  opts: { workspaceId: string; uid: string; email?: string; plan: Plan; customerId?: string },
  fetchImpl?: typeof fetch,
): Promise<{ id: string; url: string }> {
  await ensureProduct(opts.plan, fetchImpl);
  const base = appUrl();
  const meta = { workspace_id: opts.workspaceId, plan: opts.plan.id, uid: opts.uid };
  const form: Record<string, string> = {
    mode: 'subscription',
    success_url: `${base}/?checkout=subscribed&session_id={CHECKOUT_SESSION_ID}#billing`,
    cancel_url: `${base}/?checkout=cancelled#billing`,
    client_reference_id: opts.workspaceId,
    'line_items[0][quantity]': '1',
    ...priceData('line_items[0][price_data]', opts.plan),
  };
  for (const [k, v] of Object.entries(meta)) {
    form[`metadata[${k}]`] = v;
    // Copied onto the subscription, so every later subscription and invoice event carries it.
    form[`subscription_data[metadata][${k}]`] = v;
  }
  if (opts.customerId) form.customer = opts.customerId;
  else if (opts.email) form.customer_email = opts.email;
  const r = await stripe(
    'POST',
    'checkout/sessions',
    form,
    fetchImpl,
    // Same workspace + plan within 10 minutes gets the same Checkout session back (a double click, a
    // second admin or a retry), not a second subscription. A duplicate that still gets through is
    // reported by the webhook (billing.subscription.duplicate).
    `sub-checkout-${opts.workspaceId}-${opts.plan.id}-${Math.floor(Date.now() / 600_000)}`,
  );
  if ((r.body.error as { type?: string } | undefined)?.type === 'idempotency_error') {
    throw new ApiError(
      409,
      'CHECKOUT_IN_PROGRESS',
      'Someone else started a checkout for this plan a few minutes ago. Wait for it to finish, then reload.',
    );
  }
  if (!r.ok || typeof r.body.url !== 'string' || typeof r.body.id !== 'string') throw stripeFailed('checkout', r);
  return { id: r.body.id, url: r.body.url };
}

/**
 * Moves an existing subscription to another plan, charging/crediting the prorated difference now.
 * An upgrade adds the monthly credit difference when Stripe reports that invoice paid.
 */
export async function changeSubscriptionPlan(
  opts: { subscriptionId: string; workspaceId: string; uid: string; from: Plan; to: Plan },
  fetchImpl?: typeof fetch,
) {
  const cur = await stripe('GET', `subscriptions/${encodeURIComponent(opts.subscriptionId)}`, null, fetchImpl);
  const itemId = (cur.body.items as { data?: Array<{ id?: string }> } | undefined)?.data?.[0]?.id;
  if (!cur.ok || !itemId) throw stripeFailed('read subscription', cur);
  await ensureProduct(opts.to, fetchImpl);
  const upgrade = opts.to.amount > opts.from.amount;
  const upgradeCredits = upgrade ? Math.max(0, opts.to.credits - opts.from.credits) : 0;
  const r = await stripe(
    'POST',
    `subscriptions/${encodeURIComponent(opts.subscriptionId)}`,
    {
      'items[0][id]': itemId,
      ...priceData('items[0][price_data]', opts.to),
      // Upgrade: charge the prorated difference now (credits follow, in proportion, once it is paid).
      // Downgrade: no proration, so no refund to the customer balance for credits already granted; the
      // lower price applies from the next renewal.
      proration_behavior: upgrade ? 'always_invoice' : 'none',
      cancel_at_period_end: 'false',
      'metadata[workspace_id]': opts.workspaceId,
      'metadata[plan]': opts.to.id,
      'metadata[uid]': opts.uid,
      'metadata[upgrade_credits]': String(upgradeCredits),
      // Full monthly price difference; an upgrade invoice's amount over this is the share of the
      // month being paid for, and the extra credits are scaled by it.
      'metadata[upgrade_price_diff]': String(upgrade ? opts.to.amount - opts.from.amount : 0),
    },
    fetchImpl,
    `sub-change-${opts.subscriptionId}-${opts.to.id}-${Math.floor(Date.now() / 10_000)}`,
  );
  if (!r.ok) throw stripeFailed('change plan', r);
  return { upgradeCredits };
}

/** Stripe-hosted page to update the card, see invoices or cancel. */
export async function createPortalSession(customerId: string, fetchImpl?: typeof fetch): Promise<string> {
  const r = await stripe(
    'POST',
    'billing_portal/sessions',
    { customer: customerId, return_url: `${appUrl()}/#billing` },
    fetchImpl,
  );
  if (!r.ok || typeof r.body.url !== 'string') {
    // Most common cause: the Customer Portal has never been saved in the Stripe dashboard.
    console.error('[subscriptions] portal failed:', r.status, r.body.error?.message?.slice(0, 200));
    throw new ApiError(
      502,
      'PORTAL_FAILED',
      'Could not open the Stripe billing portal. The server admin must enable it in Stripe > Settings > Billing > Customer portal.',
    );
  }
  return r.body.url;
}

// ---------------------------------------------------------------- Database

interface SubRow {
  stripe_customer_id: string;
  stripe_subscription_id: string;
  plan: PlanId;
  status: string;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
}

export async function getSubscriptionRow(workspaceId: string): Promise<SubRow | null> {
  if (DEMO_MODE) return null;
  const { rows } = await db().query(
    `SELECT stripe_customer_id, stripe_subscription_id, plan, status, current_period_end, cancel_at_period_end
       FROM workspace_subscriptions WHERE workspace_id = $1`,
    [workspaceId],
  );
  return (rows[0] as SubRow) ?? null;
}

export function toSubscription(row: SubRow | null): Subscription | null {
  if (!row) return null;
  return {
    plan: row.plan,
    status: row.status,
    active: ACTIVE_STATUSES.includes(row.status),
    currentPeriodEnd: row.current_period_end ? new Date(row.current_period_end).toISOString() : null,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
  };
}

/** Fields of a Stripe Subscription object that we use (old and new API versions). */
export interface StripeSubscription {
  id: string;
  customer: string | { id: string };
  status: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: { data?: Array<{ current_period_end?: number }> };
}

/**
 * Applies a subscription event. Ignores events older than the last one applied (Stripe does not
 * guarantee order). Returns what happened, for the webhook response.
 */
export async function applySubscriptionEvent(sub: StripeSubscription, eventCreatedSec: number) {
  const workspaceId = sub.metadata?.workspace_id || '';
  const plan = findPlan(sub.metadata?.plan);
  if (!workspaceId || !plan) return { ignored: 'NO_LAUNCHPAD_METADATA' };
  const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  const eventAt = new Date(eventCreatedSec * 1000);
  return withTx(async (c) => {
    const ws = await c.query('SELECT id FROM workspaces WHERE id = $1 FOR UPDATE', [workspaceId]);
    if (!ws.rows.length) return { ignored: 'UNKNOWN_WORKSPACE' };
    const up = await c.query(
      `INSERT INTO workspace_subscriptions AS s
         (workspace_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end,
          cancel_at_period_end, last_event_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (workspace_id) DO UPDATE SET
         stripe_customer_id = EXCLUDED.stripe_customer_id,
         stripe_subscription_id = EXCLUDED.stripe_subscription_id,
         plan = EXCLUDED.plan, status = EXCLUDED.status, current_period_end = EXCLUDED.current_period_end,
         cancel_at_period_end = EXCLUDED.cancel_at_period_end, last_event_at = EXCLUDED.last_event_at,
         updated_at = now()
       WHERE (
           -- The tracked subscription: newer events win. Stripe event times are whole seconds, so on a
           -- tie the creation-time 'incomplete' never overwrites what came after it.
           s.stripe_subscription_id = EXCLUDED.stripe_subscription_id
           AND (s.last_event_at < EXCLUDED.last_event_at
                OR (s.last_event_at = EXCLUDED.last_event_at AND (EXCLUDED.status <> 'incomplete' OR s.status = 'incomplete')))
         )
          -- A different subscription replaces one that is no longer live, never a live one (so events
          -- from a stray duplicate, e.g. its cancellation, cannot overwrite the workspace's real one).
          OR (s.stripe_subscription_id <> EXCLUDED.stripe_subscription_id AND s.status NOT IN ('active', 'trialing', 'past_due'))
       RETURNING status`,
      [
        workspaceId,
        customer,
        sub.id,
        plan.id,
        sub.status,
        periodEnd ? new Date(periodEnd * 1000) : null,
        Boolean(sub.cancel_at_period_end),
        eventAt,
      ],
    );
    if (!up.rows.length) {
      const tracked = (
        await c.query('SELECT stripe_subscription_id FROM workspace_subscriptions WHERE workspace_id = $1', [
          workspaceId,
        ])
      ).rows[0]?.stripe_subscription_id;
      // A second live subscription for the same workspace (e.g. two checkouts): the customer is being
      // billed twice. Report it so the caller can record it for an admin to cancel in Stripe.
      if (tracked && tracked !== sub.id) {
        return { ignored: 'OTHER_SUBSCRIPTION', workspaceId, duplicate: ACTIVE_STATUSES.includes(sub.status) };
      }
      return { ignored: 'STALE_EVENT' };
    }
    // workspaces.plan follows the subscription: its plan while it is live, Starter once it has ended
    // (the same rule the member limits use).
    if (ACTIVE_STATUSES.includes(sub.status)) {
      await c.query('UPDATE workspaces SET plan = $2 WHERE id = $1', [workspaceId, plan.id]);
    } else if (TERMINAL_STATUSES.includes(sub.status)) {
      await c.query(`UPDATE workspaces SET plan = 'starter' WHERE id = $1`, [workspaceId]);
    }
    return { workspaceId, plan: plan.id, status: sub.status };
  });
}

/** Fields of a Stripe Invoice we use (subscription info moved under `parent` in 2025 API versions). */
export interface StripeInvoice {
  id: string;
  billing_reason?: string;
  currency?: string;
  amount_paid?: number;
  subscription?: string | null;
  subscription_details?: { metadata?: Record<string, string> } | null;
  parent?: { subscription_details?: { subscription?: string; metadata?: Record<string, string> } } | null;
}

/** Works out how many credits a paid subscription invoice adds (0 = none). */
export function creditsForInvoice(inv: StripeInvoice): {
  workspaceId: string;
  plan?: Plan;
  credits: number;
  reason: string;
} {
  const meta = inv.parent?.subscription_details?.metadata ?? inv.subscription_details?.metadata ?? {};
  const workspaceId = meta.workspace_id || '';
  const plan = findPlan(meta.plan);
  if (!workspaceId || !plan) return { workspaceId, credits: 0, reason: 'NO_LAUNCHPAD_METADATA' };
  if ((inv.currency || '').toLowerCase() !== paymentCurrency()) return { workspaceId, credits: 0, reason: 'CURRENCY' };
  if (inv.billing_reason === 'subscription_create' || inv.billing_reason === 'subscription_cycle') {
    return { workspaceId, plan, credits: plan.credits, reason: `${plan.name} plan: monthly credits` };
  }
  // Only a charged plan change (an upgrade) adds credits; downgrades and $0 updates do not.
  if (inv.billing_reason === 'subscription_update' && (inv.amount_paid ?? 0) > 0) {
    const full = Math.min(Number(meta.upgrade_credits) || 0, plan.credits);
    // Prorated: upgrading near the end of the month pays a small part of the difference, and gets the
    // same part of the extra credits (not all of them).
    // (A change made before upgrade_price_diff existed has no such field: those keep the full amount.)
    const diff = Number(meta.upgrade_price_diff) || 0;
    const share = meta.upgrade_price_diff === undefined ? 1 : diff > 0 ? Math.min(1, (inv.amount_paid ?? 0) / diff) : 0;
    return {
      workspaceId,
      plan,
      credits: Math.max(0, Math.floor(full * share)),
      reason: `Upgrade to ${plan.name}: extra credits`,
    };
  }
  return { workspaceId, plan, credits: 0, reason: 'NOT_A_PLAN_CHARGE' };
}
