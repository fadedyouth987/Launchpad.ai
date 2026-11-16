import express, { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth';
import { dataWriteRateLimiter } from '../rateLimit';
import { handle, parseBody } from '../http';
import { assertRole } from '../workspaces';
import { workspaceIdSchema } from '../schemas';
import { grantCredits } from '../credits';
import { recordAudit } from '../audit';
import { ApiError } from '../errors';
import { createCheckoutSession, creditPacks, paymentCurrency, paymentsEnabled, verifyStripeEvent } from '../payments';

const checkoutSchema = z.object({ workspaceId: workspaceIdSchema, credits: z.number().int().positive() }).strict();

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
    if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') {
      return res.json({ received: true, ignored: event.type });
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
