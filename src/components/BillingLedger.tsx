import React from 'react';
import { Workspace, LedgerEntry } from '../types';
import { 
  Zap, 
  CreditCard, 
  ShieldCheck, 
  PlusCircle, 
  CheckCircle2, 
  ArrowUpRight, 
  ArrowDownRight, 
  RefreshCw, 
  Lock,
  Layers
} from 'lucide-react';

interface BillingLedgerProps {
  currentWorkspace: Workspace;
  ledgerEntries: LedgerEntry[];
  onOpenTopUp: () => void;
  onOpenPlanModal: () => void;
}

export const BillingLedger: React.FC<BillingLedgerProps> = ({
  currentWorkspace,
  ledgerEntries,
  onOpenTopUp,
  onOpenPlanModal,
}) => {
  const workspaceEntries = ledgerEntries.filter((e) => e.workspaceId === currentWorkspace.id);

  return (
    <div className="space-y-8 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-xl bg-amber-950 text-amber-400 border border-amber-800/60">
              <Zap className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-extrabold text-white">Transactional Credit Ledger & Billing</h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800/60">
              Idempotent Stripe Outbox
            </span>
          </div>
          <p className="text-slate-400 text-xs mt-1">
            Real-time balance tracking, atomic credit reservations, and immutable financial ledger audit trails.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={onOpenPlanModal}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition-colors"
          >
            Manage Subscription
          </button>
          <button
            onClick={onOpenTopUp}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-amber-500/20 flex items-center space-x-1.5 transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Top-Up Credits</span>
          </button>
        </div>
      </div>

      {/* Credit Overview Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Available Balance</span>
            <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800/60 px-2 py-0.5 rounded-full font-bold">
              Active
            </span>
          </div>
          <div className="text-3xl font-extrabold text-white font-mono flex items-baseline space-x-2">
            <span>{currentWorkspace.creditsRemaining.toLocaleString()}</span>
            <span className="text-xs font-normal text-slate-400">Credits</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Allocated: <strong>{currentWorkspace.totalCreditsAllocated.toLocaleString()}</strong> credits on <strong>{currentWorkspace.plan.toUpperCase()}</strong>
          </p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Credit Safety Guarantee</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-sm font-bold text-white">Atomic Pre-Reservation</div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            AI generation reserves 15 credits before invoke. Settles upon success or auto-refunds on failure.
          </p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Stripe Webhook Idempotency</span>
            <Lock className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-sm font-bold text-white">Zero Double-Grant Guard</div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Stripe webhooks write to outbox logs with unique event ID state machine checks.
          </p>
        </div>
      </div>

      {/* Immutable Ledger Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <h3 className="text-base font-bold text-white flex items-center space-x-2">
            <CreditCard className="w-4 h-4 text-amber-400" />
            <span>Immutable Financial Ledger History</span>
          </h3>
          <span className="text-xs text-slate-400">Workspace ID: <strong className="text-slate-200">{currentWorkspace.id}</strong></span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
              <tr>
                <th className="p-3 rounded-l-xl">Timestamp</th>
                <th className="p-3">Type</th>
                <th className="p-3">Description</th>
                <th className="p-3">Credit Δ</th>
                <th className="p-3">New Balance</th>
                <th className="p-3 rounded-r-xl">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {workspaceEntries.map((entry) => {
                const isPositive = entry.amountCredits > 0;
                return (
                  <tr key={entry.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3 text-slate-400 font-mono text-[11px]">
                      {new Date(entry.timestamp).toLocaleString()}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        entry.type === 'reservation' ? 'bg-amber-950 text-amber-300 border border-amber-800/50' :
                        entry.type === 'purchase' || entry.type === 'topup' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/50' :
                        'bg-slate-800 text-slate-300'
                      }`}>
                        {entry.type}
                      </span>
                    </td>
                    <td className="p-3 text-slate-200 font-medium">
                      {entry.description}
                    </td>
                    <td className={`p-3 font-mono font-bold ${isPositive ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {isPositive ? `+${entry.amountCredits}` : entry.amountCredits}
                    </td>
                    <td className="p-3 text-slate-200 font-mono font-bold">
                      {entry.resultingBalance.toLocaleString()}
                    </td>
                    <td className="p-3 text-slate-500 font-mono text-[10px]">
                      {entry.stripeReference || entry.assetId || entry.id}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
