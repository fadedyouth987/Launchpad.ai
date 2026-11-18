import React from 'react';
import { CreditCard } from 'lucide-react';
import type { BillingLedgerState } from './useBillingLedger';

export function LedgerTable({ s }: { s: BillingLedgerState }) {
  const { currentWorkspace, isLight, workspaceEntries } = s;
  return (
    <>
      {/* Immutable Ledger Table */}
      <div
        className={`border rounded-2xl p-6 space-y-4 ${
          isLight ? 'bg-white border-slate-200 shadow-md' : 'bg-surface border-line'
        }`}
      >
        <div
          className={`flex items-center justify-between border-b pb-4 ${isLight ? 'border-slate-200' : 'border-line'}`}
        >
          <h2 className={`text-base font-bold flex items-center space-x-2 ${isLight ? 'text-slate-900' : 'text-ink'}`}>
            <CreditCard className="w-4 h-4 text-amber-700 dark:text-amber-400" />
            <span>Immutable Financial Ledger History</span>
          </h2>
          <span className="text-xs text-ink-subtle">
            Workspace ID: <strong className={isLight ? 'text-slate-700' : 'text-ink'}>{currentWorkspace.id}</strong>
          </span>
        </div>

        <div
          className="overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Ledger history table (scrolls sideways)"
        >
          <table className="w-full text-left text-xs">
            <thead
              className={`text-2xs font-bold uppercase tracking-wider ${
                isLight ? 'bg-slate-100 text-slate-600' : 'bg-canvas text-ink-subtle'
              }`}
            >
              <tr>
                <th className="p-3 rounded-l-xl">Timestamp</th>
                <th className="p-3">Type</th>
                <th className="p-3">Description</th>
                <th className="p-3">Credit Δ</th>
                <th className="p-3">New Balance</th>
                <th className="p-3 rounded-r-xl">Reference</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isLight ? 'divide-slate-200' : 'divide-line/60'}`}>
              {workspaceEntries.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-sm text-ink-muted">
                    No ledger entries yet. Credit grants, reservations and refunds will be listed here.
                  </td>
                </tr>
              )}
              {workspaceEntries.map((entry) => {
                const isPositive = entry.amountCredits > 0;
                return (
                  <tr
                    key={entry.id}
                    className={`transition-colors ${isLight ? 'hover:bg-slate-50' : 'hover:bg-surface-muted'}`}
                  >
                    <td className="p-3 text-ink-subtle font-mono text-2xs">
                      {new Date(entry.timestamp).toLocaleString()}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-2xs font-bold uppercase ${
                          entry.type === 'reservation'
                            ? 'bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50'
                            : entry.type === 'purchase' || entry.type === 'topup' || entry.type === 'grant'
                              ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50'
                              : isLight
                                ? 'bg-slate-200 text-slate-700'
                                : 'bg-surface-muted text-ink-muted'
                        }`}
                      >
                        {entry.type}
                      </span>
                    </td>
                    <td className={`p-3 font-medium ${isLight ? 'text-slate-800' : 'text-ink'}`}>
                      {entry.description}
                    </td>
                    <td
                      className={`p-3 font-mono font-bold ${isPositive ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}
                    >
                      {isPositive ? `+${entry.amountCredits}` : entry.amountCredits}
                    </td>
                    <td className={`p-3 font-mono font-bold ${isLight ? 'text-slate-900' : 'text-ink'}`}>
                      {entry.resultingBalance.toLocaleString()}
                    </td>
                    <td className="p-3 text-ink-subtle font-mono text-2xs">
                      {entry.stripeReference || entry.assetId || entry.id}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
