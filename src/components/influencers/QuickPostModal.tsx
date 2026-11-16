import React from 'react';
import { Dialog } from '../ui/Dialog';
import { SafeImg } from '../ui/SafeImg';
import { ShieldCheck, Send } from 'lucide-react';
import type { Platform } from '../../types';
import type { InfluencerStudioState } from './useInfluencerStudio';

export function QuickPostModal({ s }: { s: InfluencerStudioState }) {
  const {
    quickPostPrompt,
    setQuickPostPrompt,
    quickPlatform,
    setQuickPlatform,
    quickGenerating,
    quickError,
    setShowQuickPublishModal,
    selectedInfluencerForPublish,
    handleExecuteQuickGenerate,
  } = s;
  if (!selectedInfluencerForPublish) return null;
  return (
    <Dialog
      onClose={() => setShowQuickPublishModal(false)}
      label="Generate a post"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <SafeImg src={selectedInfluencerForPublish.avatarUrl} alt="" className="w-8 h-8 rounded-lg object-cover" />
            <div>
              <h3 className="text-sm font-bold text-white">Generate Post with {selectedInfluencerForPublish.name}</h3>
              <p className="text-2xs text-indigo-300 font-mono">{selectedInfluencerForPublish.handle}</p>
            </div>
          </div>
          <button
            onClick={() => setShowQuickPublishModal(false)}
            className="text-slate-400 hover:text-white text-lg font-bold"
          >
            ×
          </button>
        </div>

        <div className="space-y-4 text-xs">
          <div>
            <label className="text-slate-300 font-semibold block mb-1">Target Social Platform</label>
            <select
              aria-label="Target Social Platform"
              value={quickPlatform}
              onChange={(e) => setQuickPlatform(e.target.value as Platform)}
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3.5 py-2 outline-none focus:border-indigo-500 font-medium"
            >
              <option value="linkedin">LinkedIn Enterprise</option>
              <option value="instagram">Instagram Reel & Carousel</option>
              <option value="tiktok">TikTok Video Script</option>
              <option value="twitter">X (Twitter) Thread</option>
            </select>
          </div>

          <div>
            <label className="text-slate-300 font-semibold block mb-1">Campaign Topic or Product Feature Prompt</label>
            <textarea
              aria-label="Campaign Topic or Product Feature Prompt"
              rows={3}
              value={quickPostPrompt}
              onChange={(e) => setQuickPostPrompt(e.target.value)}
              placeholder="e.g. Discussing our new zero-trust API security release..."
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl p-3 outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1 text-2xs text-slate-400">
            <div className="flex items-center space-x-1.5 text-emerald-400 font-bold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Persona details saved with the post</span>
            </div>
            <p>
              The copy is written by this workspace&apos;s AI provider (see Settings &gt; AI Providers). Face seed{' '}
              <strong className="text-slate-200">#{selectedInfluencerForPublish.seed}</strong> is stored for reference;
              face-consistent image rendering is not connected yet.
            </p>
          </div>
        </div>

        {quickError && (
          <div
            data-testid="influencer-generate-error"
            className="p-3 rounded-xl border border-rose-800 bg-rose-950/60 text-xs text-rose-200"
          >
            {quickError}
          </div>
        )}

        <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
          <button
            onClick={() => setShowQuickPublishModal(false)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl text-xs font-bold"
          >
            Cancel
          </button>
          <button
            onClick={handleExecuteQuickGenerate}
            disabled={quickGenerating}
            className="disabled:opacity-60 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-md shadow-indigo-600/30"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{quickGenerating ? 'Generating…' : 'Generate Campaign Asset'}</span>
          </button>
        </div>
      </div>
    </Dialog>
  );
}
