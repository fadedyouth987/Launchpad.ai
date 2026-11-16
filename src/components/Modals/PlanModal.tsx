import React from 'react';
import { Dialog } from '../ui/Dialog';
import { Workspace } from '../../types';
import { CheckCircle2, X } from 'lucide-react';

interface PlanModalProps {
  currentWorkspace: Workspace;
  isOpen: boolean;
  onClose: () => void;
}

export const PlanModal: React.FC<PlanModalProps> = ({ currentWorkspace, isOpen, onClose }) => {
  if (!isOpen) return null;

  const plans = [
    {
      id: 'starter',
      name: 'Starter',
      price: '$99 / mo',
      credits: '1,000 Credits / mo',
      features: ['Up to 3 Team Members', 'Standard AI Generation', 'Basic Social Publishing'],
    },
    {
      id: 'professional',
      name: 'Professional',
      price: '$299 / mo',
      credits: '3,000 Credits / mo',
      features: [
        'Up to 10 Team Members',
        'AI generation (Claude, GPT, Gemini, Grok)',
        'Workflow Approvals & Locks',
        'SSRF Webhook Egress Guard',
      ],
      popular: true,
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: '$899 / mo',
      credits: '10,000 Credits / mo',
      features: [
        'Unlimited Members & Roles',
        'Multi-tenant RBAC Security',
        '2-Step GDPR Data Erasure',
        'Dedicated Outbox Ledger',
        'Priority Support',
      ],
    },
  ];

  return (
    <Dialog
      onClose={onClose}
      label="Select workspace subscription plan"
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 space-y-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-1 text-center max-w-md mx-auto">
          <h3 className="text-xl font-extrabold text-white">Select Workspace Subscription Plan</h3>
          <p className="text-xs text-slate-400">
            Current plan: <strong className="text-slate-200 uppercase">{currentWorkspace.plan}</strong>
          </p>
        </div>

        <p
          role="note"
          className="text-xs text-amber-200 bg-amber-950/40 border border-amber-800/60 rounded-xl px-4 py-3 leading-relaxed"
        >
          Proposed pricing. Plans are a label on the workspace today: monthly credit allocations and member limits are
          not applied automatically, and nothing can be bought until a payment provider is connected. Credits are added
          by an administrator on the server.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((p) => {
            const isCurrent = currentWorkspace.plan === p.id;
            return (
              <div
                key={p.id}
                className={`p-5 rounded-2xl border flex flex-col justify-between space-y-4 relative ${
                  isCurrent
                    ? 'bg-indigo-950/40 border-indigo-500 ring-1 ring-indigo-500'
                    : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                }`}
              >
                {p.popular && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-indigo-600 text-white font-extrabold text-2xs uppercase px-2.5 py-0.5 rounded-full shadow-md">
                    Most Popular
                  </span>
                )}

                <div className="space-y-2">
                  <h4 className="text-base font-bold text-white">{p.name}</h4>
                  <div className="text-xl font-extrabold text-slate-100 font-mono">{p.price}</div>
                  <span className="text-2xs font-semibold text-indigo-300 block">{p.credits}</span>

                  <ul className="space-y-1.5 pt-2 text-2xs text-slate-300">
                    {p.features.map((f, idx) => (
                      <li key={idx} className="flex items-center space-x-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  disabled
                  title={
                    isCurrent
                      ? undefined
                      : 'Self-serve plan subscriptions are not built yet. Buy credit packs with Top up credits, or contact support to change plan.'
                  }
                  className="w-full py-2 rounded-xl text-xs font-bold bg-slate-800 text-slate-400 cursor-not-allowed"
                >
                  {isCurrent ? 'Current plan' : 'Not self-serve yet'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
};
