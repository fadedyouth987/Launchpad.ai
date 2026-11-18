import React from 'react';
import { Dialog } from '../ui/Dialog';
import { Calendar as CalendarIcon, Sparkles } from 'lucide-react';
import type { Platform } from '../../types';
import type { SocialSchedulerState } from './useSocialScheduler';

export function ScheduleModal({ s }: { s: SocialSchedulerState }) {
  const {
    setIsScheduleModalOpen,
    targetModalDateStr,
    setTargetModalDateStr,
    modalTitle,
    setModalTitle,
    modalCaption,
    setModalCaption,
    modalPlatform,
    setModalPlatform,
    modalTime,
    setModalTime,
    selectedExistingAssetId,
    setSelectedExistingAssetId,
    workspaceAssets,
    handleSaveModalPost,
  } = s;
  return (
    <>
      <Dialog
        onClose={() => setIsScheduleModalOpen(false)}
        label="Queue a post"
        className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <div className="bg-surface border border-line rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div className="flex items-center space-x-2">
              <span className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                <CalendarIcon className="w-4 h-4" />
              </span>
              <h2 className="text-base font-extrabold text-ink">Queue Post for {targetModalDateStr}</h2>
            </div>
            <button
              onClick={() => setIsScheduleModalOpen(false)}
              className="text-ink-subtle hover:text-ink text-xs font-bold"
            >
              Cancel
            </button>
          </div>

          <div className="space-y-4 text-xs">
            {/* Pick Existing Asset or New */}
            <div>
              <label className="text-ink-muted font-semibold block mb-1">
                Assign Existing Approved Asset (Optional)
              </label>
              <select
                aria-label="Assign Existing Approved Asset (Optional)"
                value={selectedExistingAssetId}
                onChange={(e) => setSelectedExistingAssetId(e.target.value)}
                className="w-full bg-canvas border border-line text-ink rounded-xl px-3.5 py-2.5 outline-none focus:border-indigo-500"
              >
                <option value="">-- Create Custom Post below instead --</option>
                {workspaceAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    [{a.platform.toUpperCase()}] {a.title} ({a.status})
                  </option>
                ))}
              </select>
            </div>

            {!selectedExistingAssetId && (
              <>
                <div>
                  <label className="text-ink-muted font-semibold block mb-1">Post Title / Campaign Name</label>
                  <input
                    aria-label="Post Title / Campaign Name"
                    type="text"
                    placeholder="e.g. AI Influencer Launch Keynote Announcement"
                    value={modalTitle}
                    onChange={(e) => setModalTitle(e.target.value)}
                    className="w-full bg-canvas border border-line text-ink rounded-xl px-3.5 py-2.5 outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-ink-muted font-semibold block mb-1">Social Channel Platform</label>
                  <select
                    aria-label="Social Channel Platform"
                    value={modalPlatform}
                    onChange={(e) => setModalPlatform(e.target.value as Platform)}
                    className="w-full bg-canvas border border-line text-ink rounded-xl px-3.5 py-2.5 outline-none focus:border-indigo-500 capitalize"
                  >
                    <option value="linkedin">LinkedIn Company Page</option>
                    <option value="instagram">Instagram Official</option>
                    <option value="tiktok">TikTok Global</option>
                    <option value="twitter">X / Twitter Tech</option>
                    <option value="facebook">Facebook Brand Page</option>
                  </select>
                </div>

                <div>
                  <label className="text-ink-muted font-semibold block mb-1">Post Caption & Copy</label>
                  <textarea
                    aria-label="Post Caption & Copy"
                    rows={3}
                    placeholder="Enter post text, hashtags, and call to action..."
                    value={modalCaption}
                    onChange={(e) => setModalCaption(e.target.value)}
                    className="w-full bg-canvas border border-line text-ink rounded-xl p-3 outline-none focus:border-indigo-500 resize-none"
                  />
                </div>
              </>
            )}

            {/* Time Selector */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-ink-muted font-semibold block mb-1">Target Date</label>
                <input
                  aria-label="Target Date"
                  type="date"
                  value={targetModalDateStr}
                  onChange={(e) => setTargetModalDateStr(e.target.value)}
                  className="w-full bg-canvas border border-line text-ink rounded-xl px-3 py-2 outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="text-ink-muted font-semibold block mb-1">Dispatch Time (UTC)</label>
                <input
                  aria-label="Dispatch Time (UTC)"
                  type="time"
                  value={modalTime}
                  onChange={(e) => setModalTime(e.target.value)}
                  className="w-full bg-canvas border border-line text-indigo-700 dark:text-indigo-300 font-bold rounded-xl px-3 py-2 outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            </div>

            {/* AI Peak Recommendation Pill */}
            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl border border-indigo-200 dark:border-indigo-800/60 flex items-center space-x-2 text-2xs text-indigo-700 dark:text-indigo-300">
              <Sparkles className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
              <span>
                AI Peak Engagement Window for {modalPlatform.toUpperCase()}:{' '}
                <strong>09:00 AM (4.2x higher reach)</strong>
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-line flex items-center justify-end space-x-3">
            <button
              onClick={() => setIsScheduleModalOpen(false)}
              className="px-4 py-2 rounded-xl bg-surface-muted hover:bg-line-strong text-ink-muted text-xs font-bold"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveModalPost}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold shadow-lg shadow-indigo-600/30"
            >
              SCHEDULE & QUEUE POST
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
