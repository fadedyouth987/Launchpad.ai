import React, { useEffect, useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Workspace } from '../../types';
import { Zap, CreditCard, X, ShieldCheck } from 'lucide-react';
import { apiErrorMessage, apiJson } from '../../lib/api';

interface TopUpModalProps {
  currentWorkspace: Workspace;
  isOpen: boolean;
  onClose: () => void;
}

interface Packs {
  enabled: boolean;
  currency: string;
  packs: { credits: number; amount: number }[];
}

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase() }).format(amount / 100);

/** Credit top-up through Stripe Checkout. Credits are added by the server when Stripe confirms payment. */
export const TopUpModal: React.FC<TopUpModalProps> = ({ currentWorkspace, isOpen, onClose }) => {
  const [packs, setPacks] = useState<Packs | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    apiJson<Packs>('/api/billing/packs').then((r) => {
      if (r.ok) {
        setPacks(r.data);
        setSelected((s) => s ?? r.data.packs[Math.min(1, r.data.packs.length - 1)]?.credits ?? null);
      } else setError(apiErrorMessage(r, 'Could not load credit packs.'));
    });
  }, [isOpen]);

  if (!isOpen) return null;

  const checkout = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    const r = await apiJson<{ url?: string }>('/api/billing/checkout', {
      json: { workspaceId: currentWorkspace.id, credits: selected },
    });
    if (r.ok && r.data.url) {
      window.location.assign(r.data.url);
      return;
    }
    setBusy(false);
    setError(apiErrorMessage(r, 'Could not start checkout.'));
  };

  const enabled = Boolean(packs?.enabled);

  return (
    <Dialog
      onClose={onClose}
      label="Top up credits"
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div className="bg-surface border border-line rounded-2xl max-w-lg w-full p-6 space-y-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-ink-subtle hover:text-ink p-1 rounded-lg"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60">
              <Zap className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-ink">Top up credits</h2>
          </div>
          <p className="text-sm text-ink-muted">
            Add credits to <strong className="text-ink">{currentWorkspace.name}</strong>.{' '}
            {enabled
              ? 'You pay on Stripe’s secure page; credits appear here as soon as Stripe confirms the payment. Owners and admins can buy.'
              : 'Billing isn’t set up on this server yet, so credits can’t be bought. Ask your admin to connect payments.'}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Credit pack">
          {(packs?.packs ?? []).map((pkg) => {
            const isSelected = selected === pkg.credits;
            return (
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                key={pkg.credits}
                onClick={() => setSelected(pkg.credits)}
                className={`p-4 rounded-xl border transition-all space-y-2 text-center ${
                  isSelected
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-500 ring-1 ring-amber-500'
                    : 'bg-canvas border-line hover:border-line-strong'
                }`}
              >
                <div className="font-mono text-xl font-extrabold text-ink">+{pkg.credits.toLocaleString()}</div>
                <div className="text-sm text-ink-muted font-semibold">{money(pkg.amount, packs!.currency)}</div>
              </button>
            );
          })}
        </div>

        <div className="p-3 bg-canvas rounded-xl border border-line text-sm text-ink-muted flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CreditCard className="w-4 h-4 text-indigo-700 dark:text-indigo-300" />
            <span>{enabled ? 'Stripe Checkout connected' : 'No payment provider connected: purchases are off'}</span>
          </div>
          <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
        </div>

        {error && (
          <p className="text-sm font-semibold text-rose-700 dark:text-rose-300" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end space-x-3 pt-2 border-t border-line">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-ink-muted hover:text-ink bg-surface-muted"
          >
            Cancel
          </button>
          <button
            onClick={checkout}
            disabled={!enabled || busy || !selected}
            data-testid={enabled ? 'topup-checkout' : 'topup-disabled'}
            className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-amber-600 hover:bg-amber-500 disabled:bg-surface-muted disabled:text-ink-subtle disabled:cursor-not-allowed flex items-center space-x-2"
          >
            <Zap className="w-4 h-4" />
            <span>{!enabled ? 'Payments not connected' : busy ? 'Opening Stripe…' : 'Pay with Stripe'}</span>
          </button>
        </div>
      </div>
    </Dialog>
  );
};
