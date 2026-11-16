import React from 'react';
import { ShieldCheck, Lock } from 'lucide-react';
import type { BillingLedgerState } from './useBillingLedger';

export function BillingOverview({ s }: { s: BillingLedgerState }) {
  const { currentWorkspace, isLight } = s;
  return (
    <>
      <p className="max-w-3xl text-sm text-ink-muted">
        Balances and ledger entries come from the server. Credits are reserved before each AI generation and refunded
        automatically if it fails.
      </p>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div
          className={`border p-5 rounded-2xl space-y-2 relative overflow-hidden ${
            isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-ink-subtle">
            <span>Available Balance</span>
            <span className="text-2xs bg-emerald-950 text-emerald-300 border border-emerald-800/60 px-2 py-0.5 rounded-full font-bold">
              Active
            </span>
          </div>
          <div
            className={`text-3xl font-extrabold font-mono flex items-baseline space-x-2 ${
              isLight ? 'text-slate-900' : 'text-white'
            }`}
          >
            <span>{currentWorkspace.creditsRemaining.toLocaleString()}</span>
            <span className="text-xs font-normal text-ink-subtle">Credits</span>
          </div>
          <p className="text-2xs text-ink-subtle">
            Allocated: <strong>{currentWorkspace.totalCreditsAllocated.toLocaleString()}</strong> credits on{' '}
            <strong>{currentWorkspace.plan.toUpperCase()}</strong>
          </p>
        </div>

        <div
          className={`border p-5 rounded-2xl space-y-2 ${
            isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-ink-subtle">
            <span>Credit Safety Guarantee</span>
            <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
          </div>
          <div className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>Atomic Pre-Reservation</div>
          <p className="text-2xs text-ink-subtle leading-relaxed">
            Each real AI generation reserves its cost (15 credits unless the server sets AI_GENERATION_COST_CREDITS)
            before calling the AI provider and is refunded automatically if it fails. Sample output is free. Viewers
            cannot spend credits.
          </p>
        </div>

        <div
          className={`border p-5 rounded-2xl space-y-2 ${
            isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-ink-subtle">
            <span>Payment provider</span>
            <Lock className="w-4 h-4 text-indigo-700 dark:text-indigo-300" />
          </div>
          <div className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>Not connected</div>
          <p className="text-2xs text-ink-subtle leading-relaxed">
            Top-ups and plan changes are disabled. Nothing is charged to a card.
          </p>
        </div>
      </div>
    </>
  );
}
