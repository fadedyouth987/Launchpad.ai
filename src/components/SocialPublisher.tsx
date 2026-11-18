import React, { useCallback, useEffect, useState } from 'react';
import { CampaignAsset, Workspace } from '../types';
import {
  Send,
  Clock,
  Globe,
  Linkedin,
  Sparkles,
  Smartphone,
  Bot,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Unplug,
} from 'lucide-react';
import {
  disconnectSocialAccount,
  fetchSocialAccounts,
  fetchSocialPosts,
  startLinkedInConnect,
  type SocialAccount,
  type SocialPost,
} from '../lib/socialApi';

interface SocialPublisherProps {
  currentWorkspace: Workspace;
  assets: CampaignAsset[];
  /** Publishes (LinkedIn: really posts) and resolves when done. */
  onPublishNow: (assetId: string) => void | Promise<void>;
}

const daysLeft = (iso: string | null) =>
  iso ? Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000)) : null;

export const SocialPublisher: React.FC<SocialPublisherProps> = ({ currentWorkspace, assets, onPublishNow }) => {
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workspaceAssets = assets.filter((a) => a.workspaceId === currentWorkspace.id);
  const scheduledAssets = workspaceAssets.filter((a) => a.status === 'scheduled' || a.status === 'approved');
  const recentPosts = posts.slice(0, 8);

  const selectedAsset =
    workspaceAssets.find((a) => a.id === previewAssetId) || scheduledAssets[0] || workspaceAssets[0] || null;

  const linkedin = accounts.find((a) => a.provider === 'linkedin') ?? null;
  const postFor = (assetId: string) => posts.find((p) => p.assetId === assetId);

  const refresh = useCallback(async () => {
    const [a, p] = await Promise.all([fetchSocialAccounts(currentWorkspace.id), fetchSocialPosts(currentWorkspace.id)]);
    if (typeof a !== 'string') {
      setAvailable(a.available.linkedin);
      setAccounts(a.accounts);
    }
    if (typeof p !== 'string') setPosts(p);
  }, [currentWorkspace.id]);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(refresh, 30_000);
    // Fired when a LinkedIn sign-in finishes (see Dashboard), so the new account shows right away.
    const onChanged = () => void refresh();
    window.addEventListener('launchpad:social-accounts', onChanged);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('launchpad:social-accounts', onChanged);
    };
  }, [refresh]);

  const connect = async () => {
    setBusy('connect');
    setError(null);
    const r = await startLinkedInConnect(currentWorkspace.id);
    if (typeof r === 'string') {
      setBusy(null);
      setError(r);
      return;
    }
    window.location.assign(r.url);
  };

  const disconnect = async (id: string) => {
    if (!window.confirm('Disconnect LinkedIn? Scheduled LinkedIn posts will not go out until it is reconnected.'))
      return;
    setBusy('disconnect');
    const err = await disconnectSocialAccount(currentWorkspace.id, id);
    setBusy(null);
    if (err) setError(err);
    void refresh();
  };

  const publish = async (assetId: string) => {
    setBusy(assetId);
    await onPublishNow(assetId);
    setBusy(null);
    void refresh();
  };

  const linkedinDays = daysLeft(linkedin?.tokenExpiresAt ?? null);

  return (
    <div className="space-y-8 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <p className="text-sm text-ink-muted">
            Approved posts scheduled for LinkedIn are published automatically at their scheduled time. Other networks
            are handed off through webhooks (Zapier, Make, Buffer).
          </p>
        </div>
        <div className="flex items-center space-x-2 text-xs text-slate-400 bg-slate-900 border border-slate-800 px-3.5 py-2 rounded-xl">
          <Globe className="w-4 h-4 text-emerald-400" />
          <span>
            {accounts.length} account{accounts.length === 1 ? '' : 's'} connected
          </span>
        </div>
      </div>

      {/* Connected accounts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div
          className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-3 text-xs"
          data-testid="linkedin-card"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Linkedin className="w-4 h-4 text-blue-400" />
              <span className="font-bold text-slate-200">LinkedIn</span>
            </div>
            <span
              className={`w-2 h-2 rounded-full ${
                linkedin && !linkedin.expired ? 'bg-emerald-400' : linkedin ? 'bg-amber-400' : 'bg-slate-600'
              }`}
            />
          </div>
          {linkedin ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center space-x-2 min-w-0">
                {linkedin.avatarUrl && (
                  <img src={linkedin.avatarUrl} alt="" className="w-7 h-7 rounded-full" referrerPolicy="no-referrer" />
                )}
                <div className="min-w-0">
                  <p className="text-sm text-slate-100 font-semibold truncate">{linkedin.displayName}</p>
                  <p
                    className={`text-2xs ${linkedin.expired || (linkedinDays ?? 99) < 7 ? 'text-amber-300' : 'text-slate-400'}`}
                  >
                    {linkedin.expired
                      ? 'Access expired: reconnect to keep posting'
                      : `Access valid for ${linkedinDays} more day${linkedinDays === 1 ? '' : 's'}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <button
                  onClick={connect}
                  disabled={Boolean(busy)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold disabled:opacity-60"
                >
                  Reconnect
                </button>
                <button
                  onClick={() => disconnect(linkedin.id)}
                  disabled={Boolean(busy)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900 text-slate-300 disabled:opacity-60"
                  aria-label="Disconnect LinkedIn"
                  title="Disconnect"
                >
                  <Unplug className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : available ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-slate-400">Post as your LinkedIn profile. Owners and admins can connect.</p>
              <button
                onClick={connect}
                disabled={Boolean(busy)}
                data-testid="linkedin-connect"
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold shrink-0 disabled:opacity-60"
              >
                {busy === 'connect' ? 'Opening LinkedIn…' : 'Connect LinkedIn'}
              </button>
            </div>
          ) : (
            <p className="text-slate-400">
              Not set up on this server. The admin needs LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET,
              LINKEDIN_REDIRECT_URI and AI_KEYS_ENCRYPTION_KEY (see HOW_TO_RUN.md).
            </p>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-2 text-xs">
          <span className="font-bold text-slate-200">Instagram, TikTok, X, Facebook</span>
          <p className="text-slate-400">
            Not posted directly yet. When a post is approved, scheduled or published, Launchpad sends a signed webhook
            your Zapier, Make or Buffer automation can post from (Settings → Security & Webhooks).
          </p>
        </div>
      </div>

      {error && (
        <p className="text-sm font-semibold text-rose-300" role="alert">
          {error}
        </p>
      )}

      {recentPosts.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
          <h3 className="text-xs font-bold text-slate-200">Recent LinkedIn activity</h3>
          <ul className="space-y-1.5 text-xs">
            {recentPosts.map((p) => {
              const a = workspaceAssets.find((x) => x.id === p.assetId);
              return (
                <li key={p.id} className="flex items-center justify-between gap-3">
                  <span className="flex items-center space-x-2 min-w-0">
                    {p.status === 'published' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : p.status === 'failed' ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    ) : (
                      <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin shrink-0" />
                    )}
                    <span className="text-slate-200 truncate">{a?.title ?? p.assetId}</span>
                    {p.status === 'failed' && p.error && <span className="text-amber-300 truncate">· {p.error}</span>}
                  </span>
                  <span className="flex items-center space-x-2 shrink-0 text-slate-400">
                    <span>{new Date(p.updatedAt).toLocaleString()}</span>
                    {p.externalUrl && (
                      <a
                        href={p.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-300 hover:text-blue-200 flex items-center space-x-1"
                      >
                        <span>View</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {p.status === 'failed' && a && (
                      <button
                        onClick={() => publish(a.id)}
                        disabled={Boolean(busy)}
                        className="text-indigo-300 hover:text-indigo-200 font-semibold disabled:opacity-60"
                      >
                        Retry
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Scheduled Content Calendar (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <Clock className="w-4 h-4 text-indigo-300" />
              <span>Approved & Scheduled Queue ({scheduledAssets.length})</span>
            </h3>
            <span className="text-xs text-ink-subtle">
              {linkedin
                ? 'LinkedIn posts go out automatically at their scheduled time'
                : 'Connect LinkedIn to auto-post'}
            </span>
          </div>

          <div className="space-y-3">
            {scheduledAssets.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl text-center text-slate-400 text-xs space-y-2">
                <p>No content currently scheduled for auto-publishing.</p>
                <p className="text-2xs text-slate-400">
                  Submit assets through AI Studio and approve them in the Approval Queue to populate this schedule.
                </p>
              </div>
            ) : (
              scheduledAssets.map((asset) => (
                <div
                  key={asset.id}
                  onClick={() => setPreviewAssetId(asset.id)}
                  className={`p-4 rounded-2xl border transition-all space-y-3 cursor-pointer ${
                    selectedAsset?.id === asset.id
                      ? 'bg-slate-900 border-indigo-500 shadow-lg shadow-indigo-500/10'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-white capitalize bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                        {asset.platform}
                      </span>
                      <h4 className="text-xs font-bold text-slate-200 line-clamp-1">{asset.title}</h4>
                    </div>
                    {(() => {
                      const p = postFor(asset.id);
                      const direct = asset.platform === 'linkedin' && linkedin;
                      const label =
                        p?.status === 'failed'
                          ? 'Failed'
                          : p?.status === 'publishing'
                            ? 'Posting…'
                            : direct
                              ? asset.status === 'scheduled'
                                ? 'Auto-posts'
                                : 'Approved'
                              : 'Via webhook';
                      const tone =
                        p?.status === 'failed'
                          ? 'text-amber-300 bg-amber-950/60 border-amber-800/60'
                          : 'text-emerald-400 bg-emerald-950/60 border-emerald-800/60';
                      return (
                        <span
                          className={`text-2xs font-mono border px-2 py-0.5 rounded-full ${tone}`}
                          title={p?.error ?? undefined}
                        >
                          {label}
                        </span>
                      );
                    })()}
                  </div>

                  <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">{asset.caption}</p>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-2xs">
                    <span className="text-slate-400">
                      Scheduled:{' '}
                      <strong className="text-slate-200">
                        {asset.scheduledTime ? new Date(asset.scheduledTime).toLocaleString() : 'Not scheduled'}
                      </strong>
                    </span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void publish(asset.id);
                      }}
                      disabled={Boolean(busy)}
                      className="disabled:opacity-60 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded-lg text-xs font-bold shadow-md shadow-indigo-600/20 flex items-center space-x-1"
                    >
                      <Send className="w-3 h-3" />
                      <span>{busy === asset.id ? 'Posting…' : 'Publish Now'}</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Platform Device Live Preview Wrapper (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <Smartphone className="w-4 h-4 text-purple-400" />
              <span>Platform Device Preview</span>
            </h3>
            <span className="text-xs font-mono text-indigo-700 dark:text-indigo-300 uppercase">
              {selectedAsset?.platform || 'linkedin'}
            </span>
          </div>

          {selectedAsset ? (
            <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-2xl relative overflow-hidden">
              {/* Device Header Simulator */}
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-white text-xs">
                    AC
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">
                      {selectedAsset.platform === 'linkedin' && linkedin ? linkedin.displayName : currentWorkspace.name}
                    </span>
                    <span className="text-2xs text-slate-400">Preview</span>
                  </div>
                </div>
                <span className="text-2xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full capitalize">
                  {selectedAsset.platform}
                </span>
              </div>

              {/* Caption Text Body */}
              <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-line font-sans">
                {selectedAsset.caption}
              </div>

              {/* Hashtags */}
              <div className="flex flex-wrap gap-1">
                {selectedAsset.hashtags.map((h, i) => (
                  <span key={i} className="text-2xs text-indigo-300 font-medium">
                    {h}
                  </span>
                ))}
              </div>

              {/* Mock Visual Asset Box */}
              <div className="w-full h-48 bg-slate-900 rounded-2xl border border-slate-800/80 p-4 flex flex-col items-center justify-center text-center space-y-2 relative overflow-hidden">
                <div className="w-12 h-12 rounded-xl bg-indigo-950 border border-indigo-800 flex items-center justify-center text-indigo-300">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div className="space-y-0.5 max-w-xs">
                  <span className="text-xs font-bold text-white block">Visual Art Direction</span>
                  <p className="text-2xs text-slate-400 line-clamp-2 italic">{selectedAsset.visualDirection}</p>
                </div>
              </div>

              {/* Device Footer Actions */}
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-2xs text-slate-400">
                <span>Like • Comment • Repost</span>
                <span className="text-slate-400 font-medium">Preview only</span>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 text-xs">
              Select an asset to see live native device formatting.
            </div>
          )}
        </div>
      </div>

      {/* Smart Engagement Teaser Bar */}
      <div className="bg-gradient-to-r from-purple-950/80 via-slate-900 to-indigo-950/80 border border-purple-800/60 p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center space-x-3">
          <span className="p-3 rounded-2xl bg-purple-600 text-white shadow-lg shadow-purple-600/30">
            <Bot className="w-5 h-5" />
          </span>
          <div>
            <h4 className="text-sm font-extrabold text-white">Smart Engagement & AI Auto-Replies</h4>
            <p className="text-xs text-slate-300 mt-0.5">
              4 user comments pending approval across LinkedIn, Instagram, and TikTok.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-xs font-bold text-purple-300">
          <span>
            Switch to the <strong>Smart Engagement</strong> tab to review AI auto-reply suggestions.
          </span>
        </div>
      </div>
    </div>
  );
};
