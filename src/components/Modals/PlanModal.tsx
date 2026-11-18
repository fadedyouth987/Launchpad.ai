import React, { useEffect, useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Workspace } from '../../types';
import { CheckCircle2, CreditCard, X } from 'lucide-react';
import { apiErrorMessage, apiJson } from '../../lib/api';

interface PlanModalProps {
  currentWorkspace: Workspace;
  isOpen: boolean;
  onClose: () => void;
}

type PlanId = Workspace['plan'];

interface PlansResponse {
  enabled: boolean;
  currency: string;
  plans: { id: PlanId; name: string; amount: number; credits: number }[];
  /** Seats per plan from the server's PLAN_MEMBER_LIMITS (null = unlimited). */
  memberLimits?: Partial<Record<PlanId, number | null>>;
}

interface Subscription {
  plan: PlanId;
  status: string;
  active: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

// The member line comes first and is built from the server's limits (see seatsLine).
const FEATURES: Record<PlanId, string[]> = {
  starter: ['Standard AI generation', 'Approvals & scheduling'],
  professional: ['AI generation (Claude, GPT, Gemini, Grok)', 'Workflow approvals & locks', 'Signed outbound webhooks'],
  enterprise: ['Role-based access control', 'GDPR erasure workflow', 'Priority support'],
};

const seatsLine = (limit: number | null | undefined) =>
  limit === undefined ? null : limit === null ? 'Unlimited members' : `Up to ${limit} member${limit === 1 ? '' : 's'}`;

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(amount / 100);

const STATUS_TEXT: Record<string, string> = {
  active: 'Active',
  trialing: 'Trial',
  past_due: 'Payment failed: Stripe is retrying the card',
  unpaid: 'Unpaid',
  canceled: 'Cancelled',
  incomplete: 'Waiting for first payment',
  incomplete_expired: 'First payment failed',
  paused: 'Paused',
};

/** Monthly plan subscriptions through Stripe. Plan and credits change only when Stripe confirms. */
export const PlanModal: React.FC<PlanModalProps> = ({ currentWorkspace, isOpen, onClose }) => {
  const [data, setData] = useState<PlansResponse | null>(null);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = React.useCallback(async () => {
    const [p, s] = await Promise.all([
      apiJson<PlansResponse>('/api/billing/plans'),
      apiJson<{ subscription: Subscription | null }>(
        `/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/subscription`,
      ),
    ]);
    if (p.ok) setData(p.data);
    else setError(apiErrorMessage(p, 'Could not load plans.'));
    if (s.ok) setSub(s.data.subscription);
  }, [currentWorkspace.id]);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setNotice(null);
    load();
  }, [isOpen, load]);

  if (!isOpen) return null;

  const enabled = Boolean(data?.enabled);
  const active = sub?.active ? sub : null;

  const choose = async (plan: PlanId) => {
    setBusy(plan);
    setError(null);
    setNotice(null);
    const r = await apiJson<{ url?: string; changed?: boolean }>('/api/billing/subscribe', {
      json: { workspaceId: currentWorkspace.id, plan },
    });
    if (r.ok && r.data.url) {
      window.location.assign(r.data.url);
      return;
    }
    setBusy(null);
    if (r.ok && r.data.changed) {
      setNotice(
        'Plan change sent to Stripe. The prorated difference is charged now; the new plan (and any extra credits) shows here once Stripe confirms.',
      );
      setTimeout(load, 4000);
      return;
    }
    setError(apiErrorMessage(r, 'Could not change plan.'));
  };

  const portal = async () => {
    setBusy('portal');
    setError(null);
    const r = await apiJson<{ url?: string }>('/api/billing/portal', { json: { workspaceId: currentWorkspace.id } });
    if (r.ok && r.data.url) {
      window.location.assign(r.data.url);
      return;
    }
    setBusy(null);
    setError(apiErrorMessage(r, 'Could not open billing portal.'));
  };

  const renews = active?.currentPeriodEnd ? new Date(active.currentPeriodEnd).toLocaleDateString() : null;

  return (
    <Dialog
      onClose={onClose}
      label="Select workspace subscription plan"
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div className="bg-surface border border-line rounded-2xl max-w-3xl w-full p-6 space-y-6 shadow-2xl relative max-h-[95vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-ink-subtle hover:text-ink p-1 rounded-lg"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-1 text-center max-w-md mx-auto">
          <h2 className="text-xl font-extrabold text-ink">Workspace plan</h2>
          <p className="text-xs text-ink-subtle" data-testid="plan-status">
            {active ? (
              <>
                <strong className="text-ink">
                  {data?.plans.find((p) => p.id === active.plan)?.name ?? active.plan}
                </strong>{' '}
                · {STATUS_TEXT[active.status] ?? active.status}
                {renews && (active.cancelAtPeriodEnd ? ` · ends ${renews}` : ` · renews ${renews}`)}
              </>
            ) : sub ? (
              <>No active subscription ({STATUS_TEXT[sub.status] ?? sub.status})</>
            ) : (
              <>No subscription yet</>
            )}
          </p>
        </div>

        <p className="text-xs text-ink-muted bg-canvas border border-line rounded-xl px-4 py-3 leading-relaxed">
          {!data
            ? error
              ? 'Plans could not be loaded.'
              : 'Loading plans…'
            : enabled
              ? 'Billed monthly through Stripe. Each paid month adds the plan’s credits to this workspace (unused credits carry over). Upgrades are charged the prorated difference right away and add the same share of the extra credits; downgrades take effect immediately and the lower price applies from the next renewal (the current month is not refunded). Members (including open invitations) are limited per plan; on a downgrade nobody is removed, but new invitations wait until the workspace is under the limit. Owners and admins can change the plan.'
              : 'Billing isn’t set up on this server yet, so plans can’t be bought. Ask your admin to connect payments.'}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(data?.plans ?? []).map((p) => {
            const isCurrent = active?.plan === p.id;
            const label = !enabled
              ? 'Payments not connected'
              : busy === p.id
                ? 'Opening Stripe…'
                : isCurrent
                  ? active?.cancelAtPeriodEnd
                    ? 'Keep this plan'
                    : 'Current plan'
                  : active
                    ? `Switch to ${p.name}`
                    : `Subscribe`;
            const disabled = !enabled || Boolean(busy) || (isCurrent && !active?.cancelAtPeriodEnd);
            return (
              <div
                key={p.id}
                className={`p-5 rounded-2xl border flex flex-col justify-between space-y-4 relative ${
                  isCurrent
                    ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500 ring-1 ring-indigo-500'
                    : 'bg-canvas border-line hover:border-line-strong'
                }`}
              >
                {p.id === 'professional' && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-indigo-600 text-white font-extrabold text-2xs uppercase px-2.5 py-0.5 rounded-full shadow-md">
                    Most Popular
                  </span>
                )}

                <div className="space-y-2">
                  <h3 className="text-base font-bold text-ink">{p.name}</h3>
                  <div className="text-xl font-extrabold text-ink font-mono">
                    {money(p.amount, data!.currency)} <span className="text-xs text-ink-subtle">/ mo</span>
                  </div>
                  <span className="text-2xs font-semibold text-indigo-700 dark:text-indigo-300 block">
                    {p.credits.toLocaleString()} credits / month
                  </span>

                  <ul className="space-y-1.5 pt-2 text-2xs text-ink-muted">
                    {[seatsLine(data?.memberLimits?.[p.id]), ...FEATURES[p.id]].filter(Boolean).map((f) => (
                      <li key={f} className="flex items-center space-x-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  onClick={() => choose(p.id)}
                  disabled={disabled}
                  data-testid={`plan-${p.id}`}
                  className="w-full py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:bg-surface-muted disabled:text-ink-subtle disabled:cursor-not-allowed"
                >
                  {label}
                </button>
              </div>
            );
          })}
        </div>

        {notice && (
          <p className="text-sm text-emerald-700 dark:text-emerald-300" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="text-sm font-semibold text-rose-700 dark:text-rose-300" role="alert">
            {error}
          </p>
        )}

        {enabled && sub && (
          <div className="flex items-center justify-between pt-2 border-t border-line text-xs text-ink-subtle">
            <span>Update your card, download invoices or cancel on Stripe.</span>
            <button
              onClick={portal}
              disabled={Boolean(busy)}
              className="px-4 py-2 rounded-xl font-semibold text-ink bg-surface-muted hover:bg-line-strong flex items-center space-x-2 disabled:opacity-60"
            >
              <CreditCard className="w-4 h-4" />
              <span>{busy === 'portal' ? 'Opening…' : 'Manage billing'}</span>
            </button>
          </div>
        )}
      </div>
    </Dialog>
  );
};
