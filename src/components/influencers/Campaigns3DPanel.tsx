import React, { Suspense, lazy } from 'react';
import { SafeImg } from '../ui/SafeImg';
import { ExternalLink } from 'lucide-react';
import { running3DCampaigns } from './influencerData';
import type { InfluencerStudioState } from './useInfluencerStudio';

// three.js is large: load the 3D viewer only when this panel is shown.
const ThreeDAssetViewer = lazy(() => import('../ThreeDAssetViewer').then((m) => ({ default: m.ThreeDAssetViewer })));

export function Campaigns3DPanel({ s }: { s: InfluencerStudioState }) {
  void s;
  return (
    <div className="space-y-8">
      {/* Real-time WebGL 3D Canvas Asset Studio */}
      <Suspense
        fallback={
          <div role="status" className="p-8 text-center text-sm text-ink-subtle">
            Loading 3D viewer…
          </div>
        }
      >
        <ThreeDAssetViewer />
      </Suspense>

      {/* Ticker Banner */}
      <div className="bg-surface border border-line p-4 rounded-2xl flex items-center justify-between overflow-hidden">
        <div className="flex items-center space-x-3">
          <span className="flex h-3 w-3 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-bold text-ink uppercase tracking-wider">3D Marketing Broadcast Engine</span>
        </div>
        <div className="hidden sm:flex items-center space-x-6 text-xs text-ink-subtle font-mono">
          <span>
            Active Broadcasts: <strong className="text-emerald-700 dark:text-emerald-400 font-bold">3 Campaigns</strong>
          </span>
          <span>
            Global Reach:{' '}
            <strong className="text-indigo-700 dark:text-indigo-300 font-bold">456,800 Impressions</strong>
          </span>
          <span>
            Avg ROI: <strong className="text-amber-700 dark:text-amber-400 font-bold">17.7x</strong>
          </span>
        </div>
      </div>

      {/* 3D Perspective Floating Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 perspective-1000">
        {running3DCampaigns.map((camp) => (
          <div
            key={camp.id}
            className="group relative bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border border-line rounded-2xl p-6 space-y-5 transition-all duration-500 hover:-translate-y-2 hover:rotate-1 hover:shadow-2xl hover:shadow-indigo-500/20 hover:border-indigo-500/60 flex flex-col justify-between"
            style={{
              transformStyle: 'preserve-3d',
            }}
          >
            {/* Visual Media Background Cover with 3D Depth */}
            <div className="relative rounded-xl overflow-hidden h-48 border border-line">
              <SafeImg
                src={camp.mediaUrl}
                alt={camp.title}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent"></div>

              <span className="absolute top-3 left-3 bg-canvas backdrop-blur-md px-2.5 py-1 rounded-full text-2xs font-bold text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>{camp.badge}</span>
              </span>

              <span className="absolute bottom-3 left-3 right-3 text-xs font-bold text-white truncate">
                {camp.platform}
              </span>
            </div>

            {/* Info Block */}
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <SafeImg
                  src={camp.influencerAvatar}
                  alt={camp.influencerName}
                  className="w-10 h-10 rounded-xl object-cover border border-line-strong"
                />
                <div>
                  <h2 className="text-sm font-extrabold text-ink group-hover:text-indigo-700 dark:group-hover:text-indigo-400 transition-colors">
                    {camp.title}
                  </h2>
                  <p className="text-2xs text-ink-subtle">
                    AI Influencer: <strong className="text-ink">{camp.influencerName}</strong>
                  </p>
                </div>
              </div>

              <p className="text-xs text-ink-muted leading-relaxed italic">{camp.tagline}</p>
            </div>

            {/* 3D Performance Stats Box */}
            <div className="bg-canvas p-3.5 rounded-xl border border-line/80 grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <span className="text-2xs text-ink-subtle block uppercase">Reach</span>
                <span className="font-mono font-bold text-ink">{camp.impressions}</span>
              </div>
              <div>
                <span className="text-2xs text-ink-subtle block uppercase">Clicks</span>
                <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300">{camp.clicks}</span>
              </div>
              <div>
                <span className="text-2xs text-ink-subtle block uppercase">ROI</span>
                <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">{camp.roi}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-line flex items-center justify-between text-xs">
              <span className="text-ink-subtle font-medium">Live Campaign Dispatch</span>
              <button className="text-indigo-700 dark:text-indigo-300 font-bold hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center space-x-1">
                <span>Inspect 3D Data</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
