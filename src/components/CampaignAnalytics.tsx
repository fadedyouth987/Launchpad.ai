import React, { useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, Clock, Coins, Globe, Info, Layers } from 'lucide-react';
import type { CampaignAsset, LedgerEntry, Platform, Workspace } from '../types';
import { EmptyState } from './ui/States';
import { buttonClass } from './ui/Button';

interface CampaignAnalyticsProps {
  currentWorkspace: Workspace;
  assets: CampaignAsset[];
  ledgerEntries?: LedgerEntry[];
  /** Opens the AI Asset Studio (from the empty state). */
  onCreatePost?: () => void;
}

const PLATFORMS: Platform[] = ['linkedin', 'instagram', 'tiktok', 'twitter', 'facebook'];
const STATUSES: CampaignAsset['status'][] = [
  'draft',
  'pending_review',
  'approved',
  'scheduled',
  'published',
  'rejected',
];
const STATUS_LABEL: Record<CampaignAsset['status'], string> = {
  draft: 'Draft',
  pending_review: 'In review',
  approved: 'Approved',
  scheduled: 'Scheduled',
  published: 'Published',
  rejected: 'Changes requested',
};
const RANGES = { '7d': 7, '30d': 30, '90d': 90 } as const;

function created(a: CampaignAsset): number {
  const t = Date.parse(a.versions?.[0]?.createdAt || '');
  return Number.isFinite(t) ? t : 0;
}

/**
 * Analytics computed from this workspace's real data (assets and the credit ledger). Social reach,
 * clicks and engagement need the social networks' APIs, which are not connected, so they are not
 * shown as numbers.
 */
export const CampaignAnalytics: React.FC<CampaignAnalyticsProps> = ({
  currentWorkspace,
  assets,
  ledgerEntries = [],
  onCreatePost,
}) => {
  const [range, setRange] = useState<keyof typeof RANGES>('30d');
  const since = Date.now() - RANGES[range] * 86_400_000;

  const m = useMemo(() => {
    const inRange = assets.filter((a) => created(a) >= since || created(a) === 0);
    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, inRange.filter((a) => a.status === s).length]));
    const byPlatform = PLATFORMS.map((p) => ({
      platform: p,
      total: inRange.filter((a) => a.platform === p).length,
      published: inRange.filter((a) => a.platform === p && a.status === 'published').length,
    }));
    const decided = byStatus.approved + byStatus.scheduled + byStatus.published + byStatus.rejected;
    const approvalRate = decided ? Math.round(((decided - byStatus.rejected) / decided) * 100) : null;
    const upcoming = assets
      .filter((a) => a.status === 'scheduled' && a.scheduledTime && Date.parse(a.scheduledTime) > Date.now())
      .sort((a, b) => Date.parse(a.scheduledTime!) - Date.parse(b.scheduledTime!))
      .slice(0, 5);
    const ledger = ledgerEntries.filter((e) => Date.parse(e.timestamp) >= since);
    // 0 - sum, not -sum: a zero total must read 0, not -0.
    const spent =
      0 -
      ledger.filter((e) => e.type === 'reservation' || e.type === 'deduction').reduce((s, e) => s + e.amountCredits, 0);
    const refunded = ledger.filter((e) => e.type === 'refund').reduce((s, e) => s + e.amountCredits, 0);
    const added = ledger
      .filter((e) => ['purchase', 'topup', 'grant'].includes(e.type))
      .reduce((s, e) => s + e.amountCredits, 0);
    const aiCalls = ledger.filter((e) => e.type === 'reservation').length;
    return { inRange, byStatus, byPlatform, approvalRate, upcoming, spent, refunded, added, aiCalls };
  }, [assets, ledgerEntries, since]);

  const max = Math.max(1, ...m.byPlatform.map((p) => p.total));
  const stat = (label: string, value: string, sub: string, icon: React.ReactNode) => (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between text-sm font-semibold text-ink-muted">
        {label} {icon}
      </div>
      <p className="mt-2 font-mono text-3xl font-extrabold text-ink">{value}</p>
      <p className="mt-1 text-sm text-ink-subtle">{sub}</p>
    </div>
  );

  // Nothing to measure yet: one clear next step instead of a page of zeros.
  if (assets.length === 0 && ledgerEntries.length === 0) {
    return (
      <div data-testid="analytics">
        <EmptyState
          icon={BarChart3}
          title="No campaign data yet"
          description="Analytics fill in as you create, approve and publish posts. Start with your first post."
          action={
            onCreatePost && (
              <button type="button" onClick={onCreatePost} className={buttonClass('primary')}>
                Create a post
              </button>
            )
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full" data-testid="analytics">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          Real numbers from <strong className="text-ink">{currentWorkspace.name}</strong>: assets created in Launchpad
          and the credit ledger. Range applies to asset creation and ledger dates.
        </p>
        <div className="flex rounded-xl border border-line bg-surface p-1" role="group" aria-label="Date range">
          {(Object.keys(RANGES) as Array<keyof typeof RANGES>).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              onClick={() => setRange(r)}
              className={`rounded-lg px-3 py-1.5 text-sm font-bold ${range === r ? 'bg-indigo-600 text-white' : 'text-ink-muted'}`}
            >
              Last {RANGES[r]} days
            </button>
          ))}
        </div>
      </div>

      {m.inRange.length === 0 && (
        <p role="status" className="rounded-card border border-line bg-surface px-4 py-3 text-sm text-ink-muted">
          No posts were created in the last {RANGES[range]} days.{' '}
          {range !== '90d' ? 'Try a longer range, or create a new post.' : 'Create a new post to see it here.'}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stat(
          'Assets created',
          String(m.inRange.length),
          `${m.byStatus.published} published · ${m.byStatus.scheduled} scheduled`,
          <Layers className="h-4 w-4 text-indigo-700 dark:text-indigo-300" />,
        )}
        {stat(
          'Approval rate',
          m.approvalRate === null ? '—' : `${m.approvalRate}%`,
          'Of assets with a review decision',
          <CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />,
        )}
        {stat(
          'AI calls charged',
          String(m.aiCalls),
          `${m.spent.toLocaleString()} credits spent · ${m.refunded.toLocaleString()} refunded`,
          <BarChart3 className="h-4 w-4 text-purple-700 dark:text-purple-400" />,
        )}
        {stat(
          'Credits added',
          m.added.toLocaleString(),
          `Balance now ${currentWorkspace.creditsRemaining.toLocaleString()}`,
          <Coins className="h-4 w-4 text-amber-700 dark:text-amber-400" />,
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <Globe className="h-4 w-4 text-indigo-700 dark:text-indigo-300" /> Assets by channel
          </h2>
          <ul className="mt-4 space-y-3">
            {m.byPlatform.map((p) => (
              <li key={p.platform} className="text-sm">
                <div className="flex justify-between text-ink">
                  <span className="font-semibold capitalize">{p.platform}</span>
                  <span>
                    {p.total} total · {p.published} published
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-surface-muted">
                  <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${(p.total / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-base font-bold text-ink">Pipeline</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            {STATUSES.map((s) => (
              <div key={s} className="flex justify-between rounded-xl bg-canvas px-3 py-2">
                <dt className="text-ink-muted">{STATUS_LABEL[s]}</dt>
                <dd className="font-mono font-bold text-ink">{m.byStatus[s]}</dd>
              </div>
            ))}
          </dl>
          <h3 className="mt-5 flex items-center gap-2 text-sm font-bold text-ink">
            <Clock className="h-4 w-4 text-amber-700 dark:text-amber-300" /> Next scheduled
          </h3>
          {m.upcoming.length ? (
            <ul className="mt-2 space-y-1 text-sm text-ink">
              {m.upcoming.map((a) => (
                <li key={a.id}>
                  {new Date(a.scheduledTime!).toLocaleString()} · <span className="capitalize">{a.platform}</span> ·{' '}
                  {a.title}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink-subtle">Nothing scheduled in the future.</p>
          )}
        </section>
      </div>

      <section
        className="flex gap-3 rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 p-5 text-sm text-amber-900 dark:text-amber-100"
        data-testid="analytics-not-connected"
      >
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
        <p>
          Reach, impressions, clicks and engagement come from each social network&apos;s API, and no social accounts are
          connected, so those numbers are not shown. Published posts are handed to your own tools through the{' '}
          <strong>asset.published</strong> webhook; read their stats there.
        </p>
      </section>
    </div>
  );
};
