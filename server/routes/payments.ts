import express, { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth';
import { dataWriteRateLimiter } from '../rateLimit';
import { handle, parseBody, workspaceFromParam } from '../http';
import { assertRole } from '../workspaces';
import { workspaceIdSchema } from '../schemas';
import { grantCredits } from '../credits';
import { recordAudit } from '../audit';
import { ApiError } from '../errors';
import { createCheckoutSession, creditPacks, paymentCurrency, paymentsEnabled, verifyStripeEvent } from '../payments';
import { assertMember } from '../workspaces';
import {
  PLAN_IDS,
  applySubscriptionEvent,
  changeSubscriptionPlan,
  createPortalSession,
  createSubscriptionCheckout,
  creditsForInvoice,
  findPlan,
  getSubscriptionRow,
  plans,
  toSubscription,
  type StripeInvoice,
  type StripeSubscription,
} from '../subscriptions';

const checkoutSchema = z.object({ workspaceId: workspaceIdSchema, credits: z.number().int().positive() }).strict();
const subscribeSchema = z
  .object({ workspaceId: workspaceIdSchema, plan: z.enum(PLAN_IDS as [string, ...string[]]) })
  .strict();
const portalSchema = z.object({ workspaceId: workspaceIdSchema }).strict();

const notConfigured = () =>
  new ApiError(
    503,
    'PAYMENTS_NOT_CONFIGURED',
    'Payments are not connected (STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET).',
  );

export function paymentRoutes(fetchImpl?: typeof fetch) {
  const r = Router();

  r.get('/billing/packs', (_req, res) => {
    res.json({
      success: true,
      enabled: paymentsEnabled(),
      provider: 'stripe',
      currency: paymentCurrency(),
      packs: creditPacks(),
    });
  });

  // Owner/admin starts a Stripe Checkout for one pack; the browser is redirected to Stripe.
  r.post(
    '/billing/checkout',
    requireAuth,
    dataWriteRateLimiter,
    handle('billing/checkout', async (req, res) => {
      const body = parseBody(checkoutSchema, req, res);
      if (!body) return;
      if (!paymentsEnabled()) {
        throw new ApiError(
          503,
          'PAYMENTS_NOT_CONFIGURED',
          'Payments are not connected (STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET).',
        );
      }
      const ws = await assertRole(req.authContext!.uid, body.workspaceId, ['owner', 'admin']);
      const pack = creditPacks().find((p) => p.credits === body.credits);
      if (!pack) throw new ApiError(400, 'UNKNOWN_PACK', 'That credit pack does not exist.');
      const session = await createCheckoutSession(
        { workspaceId: ws.id, workspaceName: ws.name, uid: req.authContext!.uid, email: req.authContext!.email, pack },
        fetchImpl,
      );
      await recordAudit({
        workspaceId: ws.id,
        uid: req.authContext!.uid,
        ip: req.ip,
        action: 'billing.checkout.start',
        details: `Started Stripe checkout for ${pack.credits} credits (${(pack.amount / 100).toFixed(2)} ${paymentCurrency().toUpperCase()}).`,
      });
      res.json({ success: true, url: session.url, sessionId: session.id });
    }),
  );

  // ------------------------------------------------------------ Plan subscriptions

  r.get('/billing/plans', (_req, res) => {
    res.json({
      success: true,
      enabled: paymentsEnabled(),
      provider: 'stripe',
      currency: paymentCurrency(),
      plans: plans(),
    });
  });

  // Any member can see the workspace's subscription; only owners/admins can change it.
  r.get(
    '/workspaces/:workspaceId/subscription',
    requireAuth,
    handle('billing/subscription', async (req, res) => {
      const workspaceId = workspaceFromParam(req, res);
      if (!workspaceId) return;
      await assertMember(req.authContext!.uid, workspaceId);
      res.json({ success: true, subscription: toSubscription(await getSubscriptionRow(workspaceId)) });
    }),
  );

  // No active subscription -> Stripe Checkout URL. Active subscription -> plan changed in place (prorated).
  r.post(
    '/billing/subscribe',
    requireAuth,
    dataWriteRateLimiter,
    handle('billing/subscribe', async (req, res) => {
      const body = parseBody(subscribeSchema, req, res);
      if (!body) return;
      if (!paymentsEnabled()) throw notConfigured();
      const uid = req.authContext!.uid;
      const ws = await assertRole(uid, body.workspaceId, ['owner', 'admin']);
      const plan = findPlan(body.plan)!;
      const row = await getSubscriptionRow(ws.id);
      const current = toSubscription(row);
      if (current?.active && row) {
        if (current.plan === plan.id && !current.cancelAtPeriodEnd) {
          throw new ApiError(409, 'ALREADY_ON_PLAN', `This workspace is already on the ${plan.name} plan.`);
        }
        const from = findPlan(current.plan) ?? plan;
        const out = await changeSubscriptionPlan(
          { subscriptionId: row.stripe_subscription_id, workspaceId: ws.id, uid, from, to: plan },
          fetchImpl,
        );
        await recordAudit({
          workspaceId: ws.id,
          uid,
          ip: req.ip,
          action: 'billing.plan.change',
          details: `Changed plan ${from.name} -> ${plan.name}${out.upgradeCredits ? ` (+${out.upgradeCredits} credits once paid)` : ''}.`,
        });
        return res.json({ success: true, changed: true, plan: plan.id });
      }
      const session = await createSubscriptionCheckout(
        { workspaceId: ws.id, uid, email: req.authContext!.email, plan, customerId: row?.stripe_customer_id },
        fetchImpl,
      );
      await recordAudit({
        workspaceId: ws.id,
        uid,
        ip: req.ip,
        action: 'billing.subscribe.start',
        details: `Started Stripe checkout for the ${plan.name} plan (${(plan.amount / 100).toFixed(2)} ${paymentCurrency().toUpperCase()}/month).`,
      });
      res.json({ success: true, url: session.url, sessionId: session.id });
    }),
  );

  // Stripe-hosted billing portal: card, invoices, cancel.
  r.post(
    '/billing/portal',
    requireAuth,
    dataWriteRateLimiter,
    handle('billing/portal', async (req, res) => {
      const body = parseBody(portalSchema, req, res);
      if (!body) return;
      if (!paymentsEnabled()) throw notConfigured();
      const ws = await assertRole(req.authContext!.uid, body.workspaceId, ['owner', 'admin']);
      const row = await getSubscriptionRow(ws.id);
      if (!row) throw new ApiError(404, 'NO_SUBSCRIPTION', 'This workspace has no subscription yet.');
      res.json({ success: true, url: await createPortalSession(row.stripe_customer_id, fetchImpl) });
    }),
  );

  // Stripe webhook: the only place credits are added for a payment. Raw body for the signature.
  r.post('/billing/stripe/webhook', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
    if (!paymentsEnabled()) return res.status(503).json({ error: 'PAYMENTS_NOT_CONFIGURED' });
    let event;
    try {
      event = verifyStripeEvent(req.body as Buffer, req.get('stripe-signature'));
    } catch (err) {
      console.warn('[stripe] webhook rejected:', (err as Error).message);
      return res.status(400).json({ error: 'INVALID_SIGNATURE' });
    }
    const created = Number((event as { created?: number }).created) || Math.floor(Date.now() / 1000);

    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      try {
        const out = await applySubscriptionEvent(event.data.object as unknown as StripeSubscription, created);
        if ('workspaceId' in out) {
          await recordAudit({
            workspaceId: out.workspaceId,
            uid: 'stripe',
            action: 'billing.subscription.sync',
            details: `Stripe ${event.type}: ${out.plan} plan, status ${out.status}.`,
          });
        }
        return res.json({ received: true, ...out });
      } catch (err) {
        console.error('[stripe] subscription sync failed', event.id, (err as Error).message);
        return res.status(500).json({ error: 'SYNC_FAILED' }); // Stripe retries
      }
    }

    if (event.type === 'invoice.paid') {
      const inv = event.data.object as unknown as StripeInvoice;
      const grant = creditsForInvoice(inv);
      if (!grant.credits || !workspaceIdSchema.safeParse(grant.workspaceId).success) {
        return res.json({ received: true, credited: false, reason: grant.reason });
      }
      try {
        const out = await grantCredits(grant.workspaceId, grant.credits, {
          reason: `${grant.reason} (${inv.id})`,
          type: 'grant',
          idempotencyKey: `stripe_${inv.id}`,
          actor: 'stripe',
        });
        if (!out.duplicate) {
          await recordAudit({
            workspaceId: grant.workspaceId,
            uid: 'stripe',
            action: 'billing.subscription.credits',
            details: `Stripe invoice ${inv.id}: +${grant.credits} credits (new balance ${out.newBalance}).`,
          });
        }
        return res.json({ received: true, credited: !out.duplicate, duplicate: out.duplicate });
      } catch (err) {
        if (err instanceof ApiError && err.status === 404)
          return res.json({ received: true, error: 'UNKNOWN_WORKSPACE' });
        console.error('[stripe] subscription crediting failed', inv.id, (err as Error).message);
        return res.status(500).json({ error: 'CREDIT_FAILED' }); // Stripe retries
      }
    }

    if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') {
      return res.json({ received: true, ignored: event.type });
    }
    // Subscription checkouts are handled by the subscription and invoice events above.
    if ((event.data.object as { mode?: string }).mode === 'subscription') {
      return res.json({ received: true, ignored: 'subscription_checkout' });
    }
    const s = event.data.object as {
      id: string;
      payment_status?: string;
      amount_total?: number;
      currency?: string;
      metadata?: Record<string, string>;
    };
    if (s.payment_status !== 'paid') return res.json({ received: true, pending: true });
    const workspaceId = s.metadata?.workspace_id || '';
    const credits = Number(s.metadata?.credits);
    const pack = creditPacks().find((p) => p.credits === credits);
    if (!workspaceIdSchema.safeParse(workspaceId).success || !pack) {
      console.error('[stripe] paid session with unknown workspace/pack', s.id);
      return res.json({ received: true, error: 'UNKNOWN_PACK' });
    }
    if (s.amount_total !== pack.amount || (s.currency || '').toLowerCase() !== paymentCurrency()) {
      console.error('[stripe] amount/currency mismatch for', s.id);
      return res.json({ received: true, error: 'AMOUNT_MISMATCH' });
    }
    try {
      const out = await grantCredits(workspaceId, credits, {
        reason: `Stripe purchase: ${credits} credits (${s.id})`,
        type: 'purchase',
        idempotencyKey: `stripe_${s.id}`,
        actor: s.metadata?.uid || 'stripe',
      });
      if (!out.duplicate) {
        await recordAudit({
          workspaceId,
          uid: s.metadata?.uid || 'stripe',
          action: 'billing.purchase',
          details: `Stripe payment ${s.id}: +${credits} credits (new balance ${out.newBalance}).`,
        });
      }
      res.json({ received: true, credited: !out.duplicate, duplicate: out.duplicate });
    } catch (err) {
      console.error('[stripe] crediting failed', s.id, (err as Error).message);
      res.status(500).json({ error: 'CREDIT_FAILED' }); // Stripe retries
    }
  });

  return r;
}
