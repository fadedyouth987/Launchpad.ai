import React from 'react';
import { CheckCircle2, CircleDashed, FileText, PenSquare } from 'lucide-react';
import type { CampaignAsset } from '../types';
import type { Health } from '../hooks/useHealth';
import type { TabId } from '../navigation';
import { buttonClass } from './ui/Button';
import { EmptyState } from './ui/States';

const STATUS_LABEL: Record<CampaignAsset['status'], string> = {
  draft: 'Draft',
  pending_review: 'In review',
  approved: 'Approved',
  rejected: 'Changes requested',
  scheduled: 'Scheduled',
  published: 'Published',
};

const STATUS_TONE: Record<CampaignAsset['status'], string> = {
  draft: 'bg-surface-muted text-ink-muted',
  pending_review: 'bg-warning-50 text-warning-800 dark:bg-amber-950/50 dark:text-amber-200',
  approved: 'bg-success-50 text-success-700 dark:bg-emerald-950/50 dark:text-emerald-200',
  rejected: 'bg-danger-50 text-danger-700 dark:bg-rose-950/50 dark:text-rose-200',
  scheduled: 'bg-brand-50 text-brand-700 dark:bg-indigo-950/50 dark:text-indigo-200',
  published: 'bg-success-50 text-success-700 dark:bg-emerald-950/50 dark:text-emerald-200',
};

/** Where a post goes next when it is opened from the Overview. */
const OPEN_IN: Record<CampaignAsset['status'], TabId> = {
  draft: 'approvals',
  pending_review: 'approvals',
  approved: 'scheduler',
  rejected: 'approvals',
  scheduled: 'scheduler',
  published: 'publisher',
};

const PLATFORM_LABEL: Record<string, string> = {
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  twitter: 'X (Twitter)',
  facebook: 'Facebook',
};

/**
 * First thing on the Overview: the post waiting longest for review, with the one action that moves it on.
 * Nothing is shown when no post is waiting.
 */
export function NeedsYouToday({ assets, onNavigate }: { assets: CampaignAsset[]; onNavigate: (to: TabId) => void }) {
  const waiting = assets.filter((a) => a.status === 'pending_review');
  if (!waiting.length) return null;
  const first = waiting[waiting.length - 1];
  const more = waiting.length - 1;
  return (
    <section
      aria-labelledby="needs-you-title"
      data-testid="needs-you-today"
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-card sm:flex-row sm:items-center sm:gap-5 sm:p-6"
    >
      <span className="self-start rounded-full bg-warning-50 px-3 py-1 text-xs font-bold text-warning-800 sm:self-center dark:bg-amber-950/50 dark:text-amber-200">
        Needs you today
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="needs-you-title" className="truncate text-lg font-bold text-ink">
          {first.title}
        </h2>
        <p className="text-sm text-ink-muted">
          {PLATFORM_LABEL[first.platform] ?? first.platform} post waiting for review
          {more > 0 ? `, plus ${more} more` : ''}.
        </p>
      </div>
      <button
        type="button"
        onClick={() => onNavigate('approvals')}
        className="inline-flex h-11 shrink-0 items-center justify-center rounded-control bg-ink px-5 text-sm font-bold text-canvas hover:opacity-90"
      >
        Review post
      </button>
    </section>
  );
}

/**
 * The Overview below the checklist: the latest posts and what this workspace is connected to. Every row
 * opens the page where the next step happens.
 */
export function OverviewHome({
  assets,
  health,
  onNavigate,
}: {
  assets: CampaignAsset[];
  health: Health | null;
  onNavigate: (to: TabId) => void;
}) {
  const recent = assets.slice(0, 5);
  const services: Array<{ label: string; on: boolean | undefined; to: TabId }> = [
    { label: 'AI writing', on: health?.integrations.ai, to: 'ai_settings' },
    { label: 'Image generation', on: health?.integrations.imageGeneration, to: 'ai_settings' },
    { label: 'LinkedIn publishing', on: health?.integrations.socialPublishing, to: 'publisher' },
    { label: 'AI voice and video', on: health?.integrations.voice, to: 'influencers' },
    { label: 'Payments', on: health?.integrations.payments, to: 'billing' },
    { label: 'Webhooks', on: health?.integrations.webhookDelivery, to: 'webhooks' },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section
        aria-labelledby="recent-title"
        className="min-w-0 rounded-card border border-line bg-surface p-5 shadow-card lg:col-span-2"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="recent-title" className="text-lg font-bold text-ink">
            Recent work
          </h2>
          {recent.length > 0 && (
            <button type="button" onClick={() => onNavigate('approvals')} className={buttonClass('ghost', 'sm')}>
              See all in Approvals
            </button>
          )}
        </div>
        {recent.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={FileText}
              title="No posts yet"
              description="Write a short brief and Launchpad drafts the copy for each channel."
              action={
                <button type="button" onClick={() => onNavigate('studio')} className={buttonClass('primary')}>
                  <PenSquare className="h-4 w-4" aria-hidden="true" />
                  Create your first post
                </button>
              }
            />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {recent.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onNavigate(OPEN_IN[a.status])}
                  className="flex min-h-11 w-full items-center justify-between gap-3 py-3 text-left hover:bg-surface-muted rounded-control px-2 -mx-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{a.title}</span>
                    <span className="block text-xs capitalize text-ink-subtle">{a.platform}</span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-2xs font-semibold ${STATUS_TONE[a.status]}`}
                  >
                    {STATUS_LABEL[a.status]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="connected-title"
        className="min-w-0 rounded-card border border-line bg-surface p-5 shadow-card"
      >
        <h2 id="connected-title" className="text-lg font-bold text-ink">
          What’s connected
        </h2>
        <ul className="mt-4 space-y-1">
          {services.map((s) => (
            <li key={s.label}>
              <button
                type="button"
                onClick={() => onNavigate(s.to)}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-control px-2 -mx-2 text-left text-sm hover:bg-surface-muted"
              >
                <span className="font-medium text-ink">{s.label}</span>
                {health === null ? (
                  <span className="text-xs text-ink-subtle">Checking…</span>
                ) : s.on ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-success-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> On
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-semibold text-ink-subtle">
                    <CircleDashed className="h-4 w-4" aria-hidden="true" /> Not set up
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
