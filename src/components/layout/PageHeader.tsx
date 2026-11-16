import React from 'react';
import { Lightbulb, X } from 'lucide-react';
import type { NavItem, PageAction, Requirement } from '../../navigation';
import type { Health } from '../../hooks/useHealth';
import { buttonClass } from '../ui/Button';
import { NotConnected } from '../ui/States';

const REQUIREMENT_TEXT: Record<Requirement, { title: string; message: string; connected: (h: Health) => boolean }> = {
  ai: {
    title: 'AI is not connected',
    message:
      'Generation returns clearly labelled sample output and no credits are charged. Pick a provider in Settings > AI Providers: the server needs a key such as ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY or XAI_API_KEY, or an owner can save a workspace key.',
    connected: (h) => h.integrations.ai,
  },
  payments: {
    title: 'Payments are not connected',
    message: 'Top-ups and plan changes are shown for reference only. Nothing is charged to a card.',
    connected: (h) => h.integrations.payments,
  },
  channels: {
    title: 'Social networks are not connected directly',
    message:
      'Publishing marks the post as published and sends a signed asset.published webhook (with caption, hashtags and image link) to the receivers on Security & Webhooks, for example a Zapier, Make or Buffer hook that posts it. Launchpad does not log in to social networks itself.',
    connected: (h) => h.integrations.socialPublishing,
  },
};

interface PageHeaderProps {
  item: NavItem;
  sectionTitle: string;
  health: Health | null;
  onAction: (action: PageAction) => void;
  hintDismissed: boolean;
  onDismissHint: () => void;
}

/** The same header on every page: section, title, one-line description, actions, notices, tip. */
export function PageHeader({ item, sectionTitle, health, onAction, hintDismissed, onDismissHint }: PageHeaderProps) {
  const missing = health ? (item.requires || []).filter((r) => !REQUIREMENT_TEXT[r].connected(health)) : [];
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-2xs font-bold uppercase tracking-wider text-brand-700 dark:text-brand-300">
            {sectionTitle}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl" data-testid="page-title">
            {item.label}
          </h1>
          <p className="mt-1 max-w-2xl text-base text-ink-muted">{item.description}</p>
        </div>
        {(item.primaryAction || item.secondaryAction) && (
          <div className="flex flex-wrap gap-2">
            {item.secondaryAction && (
              <button
                type="button"
                onClick={() => onAction(item.secondaryAction!)}
                className={buttonClass('secondary')}
              >
                {item.secondaryAction.label}
              </button>
            )}
            {item.primaryAction && (
              <button
                type="button"
                onClick={() => onAction(item.primaryAction!)}
                className={buttonClass('primary')}
                data-testid="page-primary-action"
              >
                {item.primaryAction.label}
              </button>
            )}
          </div>
        )}
      </div>
      {missing.map((r) => (
        <NotConnected key={r} title={REQUIREMENT_TEXT[r].title} message={REQUIREMENT_TEXT[r].message} />
      ))}
      {item.hint && !hintDismissed && (
        <div
          data-testid="page-hint"
          className="flex items-start gap-3 rounded-card border border-brand-200 bg-brand-50 p-4 text-brand-900 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-100"
        >
          <Lightbulb className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p className="flex-1 text-sm">
            <span className="font-bold">Tip: </span>
            {item.hint}
          </p>
          <button
            type="button"
            onClick={onDismissHint}
            className={buttonClass('ghost', 'sm', '-my-1 text-brand-900 dark:text-brand-100')}
          >
            <X className="h-4 w-4" aria-hidden="true" />
            Got it
          </button>
        </div>
      )}
    </div>
  );
}
