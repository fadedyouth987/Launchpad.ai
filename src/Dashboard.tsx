import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { apiErrorMessage, apiJson, CREDITS_EVENT } from './lib/api';
import { initialCampaignAssets, initialWebhookLogs } from './data/initialData';
import {
  eraseWorkspaceData,
  deleteCampaignAsset,
  fetchAuditLogs,
  fetchCampaignAssets,
  fetchInfluencers,
  postAuditEvent,
  saveCampaignAsset,
  saveInfluencer,
  setLegalHold,
  setMemberRole,
  removeMember,
} from './lib/workspaceApi';
import {
  Workspace,
  CampaignAsset,
  LedgerEntry,
  WebhookDeliveryLog,
  AuditLog,
  AssetStatus,
  WorkspaceRole,
  AIInfluencer,
  Platform,
} from './types';

import { SidebarNav } from './components/SidebarNav';
import { TopHeaderBar } from './components/TopHeaderBar';
import { TopUpModal } from './components/Modals/TopUpModal';
import { PlanModal } from './components/Modals/PlanModal';
import { completeLinkedInConnect, publishAssetNow } from './lib/socialApi';
import { OverviewHome } from './components/OverviewHome';
import { newId } from './lib/ids';
import { findNavItem, type PageAction } from './navigation';
import { useHashTab } from './hooks/useHashTab';
import { modeLabel, useHealth } from './hooks/useHealth';
import { useDismissed } from './hooks/useDismissed';
import { PageHeader } from './components/layout/PageHeader';
import { GettingStarted, type OnboardingStep } from './components/layout/GettingStarted';
import { AccountControls, ThemeToggle } from './components/layout/AccountControls';
import { ErrorState, LoadingState } from './components/ui/States';

// Each tab is its own chunk, loaded the first time it is opened.
const AssetStudio = lazy(() => import('./components/AssetStudio').then((m) => ({ default: m.AssetStudio })));
const InfluencerStudio = lazy(() =>
  import('./components/InfluencerStudio').then((m) => ({ default: m.InfluencerStudio })),
);
const ApprovalQueue = lazy(() => import('./components/ApprovalQueue').then((m) => ({ default: m.ApprovalQueue })));
const SocialPublisher = lazy(() =>
  import('./components/SocialPublisher').then((m) => ({ default: m.SocialPublisher })),
);
const SocialScheduler = lazy(() =>
  import('./components/SocialScheduler').then((m) => ({ default: m.SocialScheduler })),
);
const SmartEngagement = lazy(() =>
  import('./components/SmartEngagement').then((m) => ({ default: m.SmartEngagement })),
);
const CampaignAnalytics = lazy(() =>
  import('./components/CampaignAnalytics').then((m) => ({ default: m.CampaignAnalytics })),
);
const BrandAssetLibrary = lazy(() =>
  import('./components/BrandAssetLibrary').then((m) => ({ default: m.BrandAssetLibrary })),
);
const BillingLedger = lazy(() => import('./components/BillingLedger').then((m) => ({ default: m.BillingLedger })));
const WorkspacePresence = lazy(() =>
  import('./components/WorkspacePresence').then((m) => ({ default: m.WorkspacePresence })),
);
const WebhooksSecurity = lazy(() =>
  import('./components/WebhooksSecurity').then((m) => ({ default: m.WebhooksSecurity })),
);
const SystemStatus = lazy(() => import('./components/SystemStatus').then((m) => ({ default: m.SystemStatus })));
const AiSettings = lazy(() => import('./components/AiSettings').then((m) => ({ default: m.AiSettings })));
const ApiKeys = lazy(() => import('./components/ApiKeys').then((m) => ({ default: m.ApiKeys })));
const CampaignOperatingSystem = lazy(() =>
  import('./components/CampaignOperatingSystem').then((m) => ({ default: m.CampaignOperatingSystem })),
);

interface DashboardProps {
  /** Workspaces the signed-in user belongs to, as returned by GET /api/me/workspaces (never empty). */
  workspaces: Workspace[];
  setWorkspaces: React.Dispatch<React.SetStateAction<Workspace[]>>;
  /** demo: seeded in-browser sample data. account: a Neon Auth user; data persists in Postgres via the API. */
  session: { mode: 'demo' } | { mode: 'account'; uid: string };
  onEndDemo: () => void;
}

export default function Dashboard({ workspaces, setWorkspaces, session, onEndDemo }: DashboardProps) {
  const isDemo = session.mode === 'demo';
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string>(workspaces[0].id);

  // Demo sessions start from the sample data; signed-in sessions load assets from the API (Postgres).
  const [campaignAssets, setCampaignAssets] = useState<CampaignAsset[]>(isDemo ? initialCampaignAssets : []);
  const [syncError, setSyncError] = useState<string | null>(null);
  // Influencers and the audit log are server-owned: loaded from and saved through the API.
  const [influencers, setInfluencers] = useState<AIInfluencer[]>([]);
  // Ledger and balances are server-owned: fetched from /api/billing/ledger and /api/me/workspaces.
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [webhookLogs] = useState<WebhookDeliveryLog[]>(isDemo ? initialWebhookLogs : []);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const [activeTab, setActiveTab] = useHashTab('overview');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const { health } = useHealth();
  const hints = useDismissed();
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => {
    try {
      return localStorage.getItem('launchpad-theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('launchpad-theme', themeMode);
    } catch {
      /* ignore */
    }
  }, [themeMode]);
  const [isSidebarCollapsed, setIsSidebarCollapsedState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('launchpad-sidebar-collapsed') === '1';
    } catch {
      return false;
    }
  });
  const setIsSidebarCollapsed = (v: boolean) => {
    setIsSidebarCollapsedState(v);
    try {
      localStorage.setItem('launchpad-sidebar-collapsed', v ? '1' : '0');
    } catch {
      /* ignore */
    }
  };
  const [isTopUpOpen, setIsTopUpOpen] = useState<boolean>(false);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState<boolean>(false);

  const toggleThemeMode = () => {
    setThemeMode((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId) || workspaces[0];
  // The signed-in user's member record (demo: the first sample member).
  const me = (session.mode === 'account' && currentWorkspace.members.find((m) => m.id === session.uid)) ||
    currentWorkspace.members[0] || {
      id: 'unknown',
      name: 'You',
      email: '',
      avatar: '',
      role: 'creator' as const,
      status: 'active' as const,
    };

  // Campaign assets for the current workspace (signed-in sessions only): loaded from the API and
  // re-polled every 20 s while the tab is visible so teammates' changes show up. A poll never
  // overwrites local edits that are still being saved.
  const pendingSaves = useRef(0);
  useEffect(() => {
    if (session.mode !== 'account') return;
    let cancelled = false;
    setCampaignAssets([]);
    const load = async () => {
      if (pendingSaves.current > 0 || document.visibilityState === 'hidden') return;
      const r = await fetchCampaignAssets(currentWorkspace.id);
      if (cancelled || pendingSaves.current > 0) return;
      if (typeof r === 'string') {
        console.error('[assets] load failed:', r);
        setSyncError('Could not load campaign assets from the database.');
      } else {
        assetsRef.current = r;
        setCampaignAssets(r);
      }
    };
    void load();
    const timer = window.setInterval(load, 20_000);
    document.addEventListener('visibilitychange', load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
    };
  }, [session.mode, currentWorkspace.id]);

  // Applies an asset change locally and, for signed-in sessions, persists exactly what changed.
  // Unchanged assets keep their object identity, so the diff is by reference.
  const assetsRef = useRef(campaignAssets);
  assetsRef.current = campaignAssets;
  const applyAssets = (updater: (prev: CampaignAsset[]) => CampaignAsset[]) => {
    const prev = assetsRef.current;
    const next = updater(prev);
    assetsRef.current = next;
    setCampaignAssets(next);
    if (session.mode !== 'account') return;
    const wsId = currentWorkspace.id;
    const prevById = new Map(prev.map((a) => [a.id, a]));
    const nextIds = new Set(next.map((a) => a.id));
    // Each op remembers how to undo itself locally if the server refuses it.
    const ops: { asset: CampaignAsset; old?: CampaignAsset; run: Promise<CampaignAsset['status'] | null> }[] = [];
    for (const a of next) {
      const old = prevById.get(a.id);
      if (!old || old !== a) ops.push({ asset: a, old, run: saveCampaignAsset(wsId, a) });
    }
    for (const a of prev) {
      if (!nextIds.has(a.id)) ops.push({ asset: a, old: a, run: deleteCampaignAsset(wsId, a.id).then(() => null) });
    }
    // Patches local state without saving again (the server already has, or refused, these changes).
    const patchLocal = (fn: (list: CampaignAsset[]) => CampaignAsset[]) => {
      assetsRef.current = fn(assetsRef.current);
      setCampaignAssets(assetsRef.current);
    };
    pendingSaves.current += 1;
    Promise.allSettled(ops.map((o) => o.run)).then((results) => {
      pendingSaves.current -= 1;
      const messages: string[] = [];
      results.forEach((r, i) => {
        const { asset, old } = ops[i];
        const deleted = !nextIds.has(asset.id);
        if (r.status === 'rejected') {
          console.error('[assets] save failed', r.reason);
          messages.push((r.reason as Error)?.message || 'Could not save.');
          // Undo the optimistic change: restore the previous version (or drop a new asset that was refused).
          patchLocal((list) =>
            deleted
              ? list.some((x) => x.id === asset.id)
                ? list
                : [...list, old!]
              : old
                ? list.map((x) => (x.id === asset.id && x === asset ? old : x))
                : list.filter((x) => !(x.id === asset.id && x === asset)),
          );
        } else if (!deleted && r.value && r.value !== asset.status) {
          // Saved with a different status than sent (a writer's edit to an approved post went back to review).
          patchLocal((list) => list.map((x) => (x.id === asset.id && x === asset ? { ...x, status: r.value! } : x)));
          messages.push(`"${asset.title}" was changed after approval, so it went back to review.`);
        }
      });
      if (messages.length) setSyncError([...new Set(messages)].join(' '));
    });
  };

  // Load influencers and the audit log for the current workspace.
  const refreshAudit = useCallback(async () => {
    const r = await fetchAuditLogs(currentWorkspace.id);
    if (typeof r === 'string') setSyncError(r);
    else setAuditLogs(r);
  }, [currentWorkspace.id]);

  useEffect(() => {
    let cancelled = false;
    setInfluencers([]);
    fetchInfluencers(currentWorkspace.id).then((r) => {
      if (cancelled) return;
      if (typeof r === 'string') setSyncError(r);
      else setInfluencers(r);
    });
    refreshAudit();
    return () => {
      cancelled = true;
    };
  }, [currentWorkspace.id, refreshAudit]);

  // The audit log is shown on the Security tab; refresh it there so server-recorded events appear.
  useEffect(() => {
    if (activeTab === 'webhooks') refreshAudit();
  }, [activeTab, refreshAudit]);

  // Single place that records an audit event. The server stamps actor, time and IP and stores it;
  // the entry it returns is shown immediately.
  const logAudit = (entry: {
    action: string;
    details: string;
    severity?: 'info' | 'warning';
    workspaceId?: string;
  }) => {
    const wsId = entry.workspaceId ?? currentWorkspace.id;
    postAuditEvent(wsId, {
      action: entry.action,
      details: entry.details.slice(0, 1000),
      severity: entry.severity,
    }).then((saved) => {
      if (saved && wsId === currentWorkspace.id) setAuditLogs((prev) => [saved, ...prev]);
      if (!saved) console.warn('[audit] event was not recorded', entry.action);
    });
  };

  // Saves one influencer through the API, keeping the local copy in sync.
  const persistInfluencer = (inf: AIInfluencer) => {
    saveInfluencer(currentWorkspace.id, inf).then((err) => {
      if (err) setSyncError(err);
    });
  };

  // Re-read the ledger for the current workspace from the server.
  const refreshLedger = useCallback(async () => {
    const r = await apiJson<{ entries: LedgerEntry[] }>('/api/billing/ledger', {
      headers: { 'x-workspace-id': currentWorkspace.id },
    });
    if (r.ok && Array.isArray(r.data.entries)) setLedgerEntries(r.data.entries);
  }, [currentWorkspace.id]);

  useEffect(() => {
    refreshLedger();
  }, [refreshLedger]);

  // Apply a balance reported by the server (after a charge or refund), or re-fetch it.
  const handleCreditsChanged = useCallback(
    async (newBalance?: number) => {
      const wsId = currentWorkspace.id;
      if (typeof newBalance === 'number') {
        setWorkspaces((prev) => prev.map((w) => (w.id === wsId ? { ...w, creditsRemaining: newBalance } : w)));
      } else {
        const r = await apiJson<{ creditsRemaining: number }>('/api/billing/credits/check', {
          headers: { 'x-workspace-id': wsId },
        });
        if (r.ok && typeof r.data.creditsRemaining === 'number') {
          const balance = r.data.creditsRemaining;
          setWorkspaces((prev) => prev.map((w) => (w.id === wsId ? { ...w, creditsRemaining: balance } : w)));
        }
      }
      refreshLedger();
    },
    [currentWorkspace.id, refreshLedger, setWorkspaces],
  );

  // Returning from Stripe Checkout: credits arrive through the webhook, so re-check the balance a few times.
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const social = params.get('social');
    if (social === 'pending') {
      // Back from LinkedIn: finish the connection with this browser's signed-in session.
      const workspace = params.get('workspace') || '';
      const pending = params.get('pending') || '';
      // The URL is cleared first, so a re-run of this effect (React StrictMode) does not send it twice.
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
      void completeLinkedInConnect(workspace, pending).then((err) => {
        if (!err) window.dispatchEvent(new Event('launchpad:social-accounts'));
        setCheckoutNotice(
          err
            ? `LinkedIn could not be connected: ${err}`
            : 'LinkedIn connected. Approved posts scheduled for LinkedIn will now be published automatically.',
        );
      });
      return;
    }
    if (social) {
      const reason = params.get('reason') || '';
      setCheckoutNotice(
        social === 'connected'
          ? 'LinkedIn connected. Approved posts scheduled for LinkedIn will now be published automatically.'
          : reason === 'cancelled'
            ? 'LinkedIn connection cancelled.'
            : `LinkedIn could not be connected (${reason || 'unknown error'}). Try again, or ask the server admin to check the LinkedIn app settings.`,
      );
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
      return;
    }
    const state = params.get('checkout');
    if (!state) return;
    setCheckoutNotice(
      state === 'success'
        ? 'Payment received by Stripe. Credits are added as soon as Stripe confirms it (usually a few seconds).'
        : state === 'subscribed'
          ? 'Subscription started. Your plan and this month’s credits appear as soon as Stripe confirms the payment (usually a few seconds).'
          : 'Checkout cancelled. Nothing was charged.',
    );
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
    if (state === 'success' || state === 'subscribed') {
      const timers = [2000, 6000, 15000].map((ms) => setTimeout(() => handleCreditsChanged(), ms));
      return () => timers.forEach(clearTimeout);
    }
  }, [handleCreditsChanged]);

  // Balance updates reported by any API call (e.g. AI assists in other screens).
  useEffect(() => {
    const onCredits = (e: Event) => {
      const { workspaceId, newBalance } = (e as CustomEvent<{ workspaceId: string; newBalance: number }>).detail;
      setWorkspaces((prev) => prev.map((w) => (w.id === workspaceId ? { ...w, creditsRemaining: newBalance } : w)));
      if (workspaceId === currentWorkspace.id) refreshLedger();
    };
    window.addEventListener(CREDITS_EVENT, onCredits);
    return () => window.removeEventListener(CREDITS_EVENT, onCredits);
  }, [currentWorkspace.id, refreshLedger, setWorkspaces]);

  // Helper: Add Asset
  const handleAddAsset = (newAsset: CampaignAsset) => {
    applyAssets((prev) => [newAsset, ...prev]);

    // Record Audit
    logAudit({
      action: 'ai.asset.create',
      details: `Created new AI Campaign Asset "${newAsset.title}" for ${newAsset.platform.toUpperCase()}`,
    });
  };

  // Helper: Update Asset Status
  const handleUpdateAssetStatus = (
    assetId: string,
    status: AssetStatus,
    commentText?: string,
    rejectionReason?: string,
  ) => {
    applyAssets((prev) =>
      prev.map((a) => {
        if (a.id !== assetId) return a;

        const updatedComments = commentText
          ? [
              ...a.comments,
              {
                id: newId('c'),
                authorName: me.name,
                authorAvatar: me.avatar,
                text: commentText,
                createdAt: new Date().toISOString(),
              },
            ]
          : a.comments;

        return {
          ...a,
          status,
          rejectionReason: rejectionReason || a.rejectionReason,
          decidedAt: status === 'approved' || status === 'rejected' ? new Date().toISOString() : a.decidedAt,
          comments: updatedComments,
        };
      }),
    );

    // Audit Log
    const targetAsset = campaignAssets.find((a) => a.id === assetId);
    if (targetAsset) {
      logAudit({
        action: `asset.status.${status}`,
        details: `Updated status of "${targetAsset.title}" to ${status.toUpperCase()}`,
      });
    }
  };

  // Helper: Batch Approve All
  const handleBatchApproveAll = () => {
    applyAssets((prev) =>
      prev.map((a) => {
        if (a.workspaceId === currentWorkspace.id && a.status === 'pending_review') {
          return {
            ...a,
            status: 'approved',
            decidedAt: new Date().toISOString(),
            comments: [
              ...a.comments,
              {
                id: newId('c'),
                authorName: me.name,
                authorAvatar: me.avatar,
                text: 'Approved in bulk.',
                createdAt: new Date().toISOString(),
              },
            ],
          };
        }
        return a;
      }),
    );

    logAudit({
      action: 'asset.batch.approve',
      details: 'Executed Batch Approval for all pending review assets.',
    });
  };

  // Helper: Publish Now
  // LinkedIn posts (signed-in sessions) are really published by the server; the server also marks the
  // asset published. Other platforms are only marked published here (their webhook hands them off).
  const handlePublishNow = async (assetId: string) => {
    const targetAsset = assetsRef.current.find((a) => a.id === assetId);
    if (!targetAsset) return;
    if (session.mode === 'account' && targetAsset.platform === 'linkedin') {
      const r = await publishAssetNow(currentWorkspace.id, assetId);
      if (!r.ok) {
        setSyncError(`LinkedIn: ${r.message}`);
        return;
      }
      const next = assetsRef.current.map((a) => (a.id === assetId ? { ...a, status: 'published' as const } : a));
      assetsRef.current = next;
      setCampaignAssets(next);
      setCheckoutNotice(`Posted "${targetAsset.title}" to LinkedIn.`);
      return;
    }
    applyAssets((prev) => prev.map((a) => (a.id === assetId ? { ...a, status: 'published' } : a)));
    logAudit({
      action: 'asset.status.published',
      details: `Marked "${targetAsset.title}" as published on ${targetAsset.platform.toUpperCase()} (not posted directly; webhook receivers are notified).`,
    });
  };

  // Member roles and legal hold are changed on the server (owner/admin only, audited).
  const handleUpdateMemberRole = async (memberId: string, role: WorkspaceRole) => {
    const wsId = currentWorkspace.id;
    const err = await setMemberRole(wsId, memberId, role);
    if (err) return setSyncError(err);
    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id === wsId ? { ...w, members: w.members.map((m) => (m.id === memberId ? { ...m, role } : m)) } : w,
      ),
    );
    refreshAudit();
  };

  const handleRemoveMember = async (memberId: string) => {
    const wsId = currentWorkspace.id;
    const err = await removeMember(wsId, memberId);
    if (err) return setSyncError(err);
    setWorkspaces((prev) =>
      prev.map((w) => (w.id === wsId ? { ...w, members: w.members.filter((m) => m.id !== memberId) } : w)),
    );
    refreshAudit();
  };

  const handleToggleLegalHold = async (wsId: string) => {
    const ws = workspaces.find((w) => w.id === wsId);
    if (!ws) return;
    const err = await setLegalHold(wsId, !ws.legalHoldActive);
    if (err) return setSyncError(err);
    setWorkspaces((prev) => prev.map((w) => (w.id === wsId ? { ...w, legalHoldActive: !ws.legalHoldActive } : w)));
    refreshAudit();
  };

  // (The server records the audit entry for new influencers.)
  const handleSaveInfluencer = (newInf: AIInfluencer) => {
    const inf = { ...newInf, workspaceId: currentWorkspace.id };
    setInfluencers((prev) => [inf, ...prev.filter((i) => i.id !== inf.id)]);
    saveInfluencer(currentWorkspace.id, inf).then((err) => {
      if (err) setSyncError(err);
      else refreshAudit();
    });
  };

  // Helper: Toggle Lock Influencer
  const handleToggleLockInfluencer = (id: string) => {
    const target = influencers.find((inf) => inf.id === id);
    if (!target) return;
    const updated = { ...target, locked: !target.locked };
    setInfluencers((prev) => prev.map((inf) => (inf.id === id ? updated : inf)));
    persistInfluencer(updated);
    logAudit({
      action: updated.locked ? 'ai.influencer.lock' : 'ai.influencer.unlock',
      details: `${updated.locked ? 'Locked' : 'Unlocked'} identity of "${updated.name}".`,
    });
  };

  // Helper: Update Asset Schedule Time / Status from Drag & Drop or Modal
  const handleUpdateAssetSchedule = (assetId: string, newScheduledTime: string, newStatus?: AssetStatus) => {
    applyAssets((prev) =>
      prev.map((a) =>
        a.id === assetId
          ? {
              ...a,
              scheduledTime: newScheduledTime,
              status: newStatus || a.status,
            }
          : a,
      ),
    );

    logAudit({
      action: 'scheduler.post.rescheduled',
      details: `Rescheduled asset ${assetId} to ${newScheduledTime}`,
    });
  };

  // Helper: Quick Schedule New Post
  const handleQuickScheduleNewPost = (title: string, caption: string, platform: Platform, scheduledTime: string) => {
    const newAsset: CampaignAsset = {
      id: newId('asset-sched'),
      workspaceId: currentWorkspace.id,
      title,
      platform,
      status: 'scheduled',
      currentVersion: 1,
      caption,
      hashtags: ['#Scheduled', '#SocialMarketing', '#AIStudio'],
      imagePrompt: `Custom branded creative asset graphics for ${title}`,
      visualDirection: 'Enterprise Social Campaign Style',
      scheduledTime,
      decidedAt: new Date().toISOString(),
      versions: [
        {
          versionNumber: 1,
          createdAt: new Date().toISOString(),
          createdBy: me.name,
          caption,
          hashtags: ['#Scheduled', '#SocialMarketing', '#AIStudio'],
          imagePrompt: `Custom branded creative asset graphics for ${title}`,
          visualDirection: 'Enterprise Social Campaign Style',
          costCredits: 0,
        },
      ],
      comments: [],
    };

    applyAssets((prev) => [newAsset, ...prev]);

    logAudit({
      action: 'scheduler.post.created',
      details: `Queued new scheduled post "${title}" for ${scheduledTime}`,
    });
  };

  // Helper: Generate Content for Influencer
  // Generates influencer content through the server (credits checked/charged/refunded there).
  // Returns an error message, or null on success.
  const handleGenerateContentForInfluencer = async (
    influencer: AIInfluencer,
    prompt: string,
    platform: Platform,
  ): Promise<string | null> => {
    const persona = `As ${influencer.name} (${influencer.handle}), a ${influencer.archetype} creator in ${influencer.niche}: `;
    const r = await apiJson<{
      sample?: boolean;
      costCredits?: number;
      newBalance?: number;
      refunded?: boolean;
      data?: { caption: string; hashtags: string[] };
    }>('/api/generate', {
      json: {
        workspaceId: currentWorkspace.id,
        purpose: 'influencer',
        prompt: (persona + prompt).slice(0, 2000),
        platform,
      },
    });
    if (typeof r.data.newBalance === 'number' || r.data.refunded) handleCreditsChanged(r.data.newBalance);
    if (!r.ok || !r.data.data) return apiErrorMessage(r, 'AI generation failed. Please try again.');
    const cost = r.data.costCredits ?? 0;
    const caption = r.data.data.caption;
    const hashtags = r.data.data.hashtags;
    const sampleNote = r.data.sample ? ' (demo sample text: no AI key configured, not charged)' : '';

    const newAsset: CampaignAsset = {
      id: newId('asset'),
      workspaceId: currentWorkspace.id,
      title: `${influencer.name}: ${prompt.substring(0, 45)}...`,
      platform,
      status: 'pending_review',
      currentVersion: 1,
      caption,
      hashtags,
      imagePrompt: `${influencer.name}: ${influencer.appearancePrompt}. Scene: ${prompt}`,
      visualDirection: `Rendered with ${influencer.loraWeights.lightingModel} lighting. Face Consistency: ${(influencer.loraWeights.faceConsistency * 100).toFixed(0)}%`,
      versions: [
        {
          versionNumber: 1,
          createdAt: new Date().toISOString(),
          createdBy: influencer.name,
          caption,
          hashtags,
          imagePrompt: `${influencer.name}: ${influencer.appearancePrompt}`,
          visualDirection: `${influencer.loraWeights.lightingModel} Studio Lighting`,
          costCredits: cost,
        },
      ],
      comments: [
        {
          id: newId('c'),
          authorName: 'System AI Engine',
          authorAvatar: influencer.avatarUrl,
          text: `Generated copy for locked persona #${influencer.seed} (${influencer.faceEmbeddingHash})${sampleNote}. Ready for review.`,
          createdAt: new Date().toISOString(),
        },
      ],
    };

    applyAssets((prev) => [newAsset, ...prev]);

    // Update influencer posts count
    const counted = { ...influencer, postsGeneratedCount: influencer.postsGeneratedCount + 1 };
    setInfluencers((prev) => prev.map((inf) => (inf.id === influencer.id ? counted : inf)));
    persistInfluencer(counted);
    logAudit({
      action: 'ai.influencer.content',
      details: `Generated a ${platform} post for "${influencer.name}"${r.data.sample ? ' (sample, not charged)' : ` (${cost} credits)`}.`,
    });

    setActiveTab('approvals');
    return null;
  };

  // GDPR erase on the server (owner only; refused during legal hold). Returns an error message or null.
  const handleExecuteGdprErase = async (wsId: string, confirmSlug: string): Promise<string | null> => {
    const err = await eraseWorkspaceData(wsId, confirmSlug);
    if (err) return err;
    // Signed-in sessions: the asset subscription reflects the deletion. Demo: assets live in this tab.
    if (isDemo) setCampaignAssets((prev) => prev.filter((a) => a.workspaceId !== wsId));
    if (wsId === currentWorkspace.id) {
      setInfluencers([]);
      refreshAudit();
    }
    return null;
  };

  const nav = findNavItem(activeTab);
  const runPageAction = (action: PageAction) => {
    if (action.to) setActiveTab(action.to);
    else if (action.command === 'topUp') setIsTopUpOpen(true);
    else if (action.command === 'plans') setIsPlanModalOpen(true);
  };
  const wsAssets = campaignAssets.filter((a) => a.workspaceId === currentWorkspace.id);
  const onboardingSteps: OnboardingStep[] = [
    {
      id: 'create',
      title: 'Create an asset',
      description: 'Write a short brief in AI Asset Studio and generate copy for your channels.',
      done: wsAssets.length > 0,
      to: 'studio',
      cta: 'Open AI Asset Studio',
    },
    {
      id: 'approve',
      title: 'Review and approve',
      description: 'Check the draft, leave comments and approve it in the Approvals Queue.',
      done: wsAssets.some((a) => ['approved', 'scheduled', 'published'].includes(a.status)),
      to: 'approvals',
      cta: 'Open Approvals Queue',
    },
    {
      id: 'schedule',
      title: 'Schedule it',
      description: 'Place approved posts on the calendar in the Social Scheduler.',
      done: wsAssets.some((a) => a.status === 'scheduled' || a.status === 'published'),
      to: 'scheduler',
      cta: 'Open Social Scheduler',
    },
    {
      id: 'team',
      title: 'Check your team',
      description: 'See who can approve and publish, and change roles in Team Presence.',
      done: currentWorkspace.members.length > 1,
      to: 'presence',
      cta: 'Open Team Presence',
    },
  ];
  const sidebarFooter = (
    <>
      <button
        type="button"
        onClick={() => {
          setActiveTab('audit_inspector');
          setIsMobileNavOpen(false);
        }}
        className="flex h-9 w-full items-center gap-2 rounded-control border border-amber-300 bg-warning-50 px-3 text-xs font-semibold text-warning-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
      >
        <span className="h-2 w-2 rounded-full bg-amber-600" aria-hidden="true" />
        {modeLabel(health).label}
      </button>
      <ThemeToggle themeMode={themeMode} onToggle={toggleThemeMode} full />
      <AccountControls themeMode={themeMode} full />
    </>
  );

  return (
    <div
      className={`min-h-screen font-sans ${themeMode === 'dark' ? 'dark ' : ''}bg-canvas text-ink selection:bg-brand-600 selection:text-white`}
    >
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <SidebarNav
        currentWorkspace={currentWorkspace}
        workspaces={workspaces}
        onSelectWorkspace={setCurrentWorkspaceId}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenTopUp={() => setIsTopUpOpen(true)}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
        isMobileOpen={isMobileNavOpen}
        setIsMobileOpen={setIsMobileNavOpen}
        mobileFooter={sidebarFooter}
      />

      <div
        className={`flex min-w-0 flex-col transition-[padding] duration-200 ${isSidebarCollapsed ? 'lg:pl-sidebar-collapsed' : 'lg:pl-sidebar'}`}
      >
        <TopHeaderBar
          currentWorkspace={currentWorkspace}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          health={health}
          themeMode={themeMode}
          onToggleTheme={toggleThemeMode}
          isMenuOpen={isMobileNavOpen}
          onOpenMenu={() => setIsMobileNavOpen(true)}
          auditLogs={auditLogs}
        />

        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8 lg:pb-24"
        >
          {isDemo && (
            <div
              data-testid="demo-banner"
              role="note"
              className="flex flex-col gap-2 rounded-card border border-amber-300 bg-warning-50 px-4 py-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100"
            >
              <span>
                <strong>Demo session.</strong> You are using shared sample data; changes are kept in server memory only.
              </span>
              <button
                type="button"
                onClick={onEndDemo}
                className="self-start font-bold underline underline-offset-2 sm:self-auto"
              >
                Exit demo
              </button>
            </div>
          )}
          {syncError && <ErrorState title="Not saved" message={syncError} onRetry={() => window.location.reload()} />}
          {checkoutNotice && (
            <div
              role="status"
              data-testid="checkout-notice"
              className="flex items-center justify-between gap-3 rounded-card border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-100"
            >
              <span>{checkoutNotice}</span>
              <button type="button" className="font-bold underline" onClick={() => setCheckoutNotice(null)}>
                Dismiss
              </button>
            </div>
          )}
          <PageHeader
            item={nav.item}
            sectionTitle={nav.section.title}
            health={health}
            onAction={runPageAction}
            hintDismissed={hints.isDismissed(`hint:${nav.item.id}`)}
            onDismissHint={() => hints.dismiss(`hint:${nav.item.id}`)}
          />
          <Suspense fallback={<LoadingState label={`Loading ${nav.item.label}…`} />}>
            {activeTab === 'campaign_os' && (
              <CampaignOperatingSystem key={currentWorkspace.id} workspaceId={currentWorkspace.id} />
            )}

            {activeTab === 'overview' && (
              <>
                {!hints.isDismissed('getting-started') && (
                  <GettingStarted
                    steps={onboardingSteps}
                    onNavigate={setActiveTab}
                    onHide={() => hints.dismiss('getting-started')}
                  />
                )}
                <OverviewHome assets={campaignAssets} health={health} onNavigate={setActiveTab} />
              </>
            )}

            {activeTab === 'studio' && (
              <AssetStudio
                currentWorkspace={currentWorkspace}
                onAddAsset={handleAddAsset}
                onCreditsChanged={handleCreditsChanged}
                onNavigateToApprovals={() => setActiveTab('approvals')}
              />
            )}

            {activeTab === 'influencers' && (
              <InfluencerStudio
                currentWorkspace={currentWorkspace}
                influencers={influencers}
                onSaveInfluencer={handleSaveInfluencer}
                onToggleLock={handleToggleLockInfluencer}
                onGenerateContentForInfluencer={handleGenerateContentForInfluencer}
              />
            )}

            {activeTab === 'approvals' && (
              <ApprovalQueue
                currentWorkspace={currentWorkspace}
                assets={campaignAssets}
                onUpdateAssetStatus={handleUpdateAssetStatus}
                onBatchApproveAll={handleBatchApproveAll}
              />
            )}

            {activeTab === 'publisher' && (
              <SocialPublisher
                currentWorkspace={currentWorkspace}
                assets={campaignAssets}
                onPublishNow={handlePublishNow}
              />
            )}

            {activeTab === 'scheduler' && (
              <SocialScheduler
                currentWorkspace={currentWorkspace}
                assets={campaignAssets}
                influencers={influencers}
                onUpdateAssetSchedule={handleUpdateAssetSchedule}
                onPublishNow={handlePublishNow}
                onQuickScheduleNewPost={handleQuickScheduleNewPost}
              />
            )}

            {activeTab === 'engagement' && (
              <SmartEngagement
                currentWorkspace={currentWorkspace}
                assets={campaignAssets}
                onReplyAdded={(assetId, commentId, replyText) => {
                  applyAssets((prev) =>
                    prev.map((a) =>
                      a.id === assetId
                        ? {
                            ...a,
                            comments: [
                              ...a.comments,
                              {
                                id: newId('reply'),
                                authorName: `${currentWorkspace.name} Community Bot`,
                                authorAvatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150',
                                text: replyText,
                                createdAt: new Date().toISOString(),
                              },
                            ],
                          }
                        : a,
                    ),
                  );
                }}
              />
            )}

            {activeTab === 'analytics' && (
              <CampaignAnalytics
                currentWorkspace={currentWorkspace}
                assets={campaignAssets}
                ledgerEntries={ledgerEntries}
                onCreatePost={() => setActiveTab('studio')}
              />
            )}

            {activeTab === 'brand_library' && <BrandAssetLibrary currentWorkspace={currentWorkspace} />}

            {activeTab === 'billing' && (
              <BillingLedger
                currentWorkspace={currentWorkspace}
                ledgerEntries={ledgerEntries}
                onOpenTopUp={() => setIsTopUpOpen(true)}
                onOpenPlanModal={() => setIsPlanModalOpen(true)}
                themeMode={themeMode}
              />
            )}

            {activeTab === 'presence' && (
              <WorkspacePresence
                currentWorkspace={currentWorkspace}
                currentUserId={session.mode === 'account' ? session.uid : undefined}
                onUpdateMemberRole={handleUpdateMemberRole}
                onRemoveMember={session.mode === 'account' ? handleRemoveMember : undefined}
              />
            )}

            {activeTab === 'webhooks' && (
              <WebhooksSecurity
                currentWorkspace={currentWorkspace}
                webhookLogs={webhookLogs}
                auditLogs={auditLogs}
                onToggleLegalHold={handleToggleLegalHold}
                onExecuteGdprErase={handleExecuteGdprErase}
              />
            )}

            {activeTab === 'audit_inspector' && <SystemStatus workspaceId={currentWorkspace.id} />}
            {activeTab === 'ai_settings' && <AiSettings workspaceId={currentWorkspace.id} />}
            {activeTab === 'api_keys' && (
              <ApiKeys
                workspaceId={currentWorkspace.id}
                signedIn={session.mode === 'account'}
                canManage={
                  session.mode === 'account' &&
                  ['owner', 'admin'].includes(currentWorkspace.members.find((m) => m.id === session.uid)?.role ?? '')
                }
              />
            )}
          </Suspense>
        </main>

        {/* Modals */}
        <TopUpModal currentWorkspace={currentWorkspace} isOpen={isTopUpOpen} onClose={() => setIsTopUpOpen(false)} />

        <PlanModal
          currentWorkspace={currentWorkspace}
          isOpen={isPlanModalOpen}
          onClose={() => setIsPlanModalOpen(false)}
        />
      </div>
    </div>
  );
}
