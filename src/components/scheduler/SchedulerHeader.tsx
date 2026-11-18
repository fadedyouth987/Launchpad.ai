import React from 'react';
import { Plus, CheckCircle2, Linkedin, Instagram, Twitter, Facebook, Video, Zap } from 'lucide-react';
import type { SocialSchedulerState } from './useSocialScheduler';

export function SchedulerHeader({ s }: { s: SocialSchedulerState }) {
  const {
    dispatchNotification,
    handleTriggerAutoDispatch,
    handleOpenScheduleModalForDate,
    totalScheduledMonth,
    totalPublishedMonth,
  } = s;
  return (
    <>
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-line pb-6">
        <div>
          <div className="flex items-center space-x-3">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-2xs font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60">
                  Drag & Drop Calendar
                </span>
              </div>
              <p className="text-sm text-ink-muted">
                Plan posts on a monthly calendar and drag them to reschedule. Posting to social networks is not
                connected yet.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleTriggerAutoDispatch}
            title="Marks scheduled and approved posts as published here. Social publishing is not connected."
            className="bg-emerald-700 hover:bg-emerald-600 text-white font-extrabold px-4 py-2.5 rounded-xl text-xs flex items-center space-x-2 shadow-lg shadow-emerald-600/20 transition-all"
          >
            <Zap className="w-4 h-4" aria-hidden="true" />
            <span>Mark queue as published</span>
          </button>

          <button
            onClick={() => handleOpenScheduleModalForDate(s.todayKey)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold px-4 py-2.5 rounded-xl text-xs flex items-center space-x-2 shadow-xl shadow-indigo-600/30 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>New post</span>
          </button>
        </div>
      </div>

      {/* Dispatch Notification Banner */}
      {dispatchNotification && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-2xl text-xs flex items-center justify-between shadow-xl animate-fade-in">
          <div className="flex items-center space-x-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0" />
            <span className="font-bold">{dispatchNotification}</span>
          </div>
          <span className="text-2xs font-mono text-emerald-700 dark:text-emerald-400">Queue Synchronized</span>
        </div>
      )}

      {/* Month Metrics & Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-surface border border-line p-4 rounded-2xl space-y-1">
          <span className="text-2xs font-bold uppercase tracking-wider text-ink-subtle">Month Scheduled Queue</span>
          <p className="text-2xl font-extrabold text-ink font-mono">
            {totalScheduledMonth} <span className="text-xs text-ink-subtle font-normal">posts</span>
          </p>
        </div>

        <div className="bg-surface border border-line p-4 rounded-2xl space-y-1">
          <span className="text-2xs font-bold uppercase tracking-wider text-ink-subtle">Published This Month</span>
          <p className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 font-mono">
            {totalPublishedMonth} <span className="text-xs text-ink-subtle font-normal">marked published</span>
          </p>
        </div>

        <div className="bg-surface border border-line p-4 rounded-2xl space-y-1">
          <span className="text-2xs font-bold uppercase tracking-wider text-ink-subtle">Suggested posting times</span>
          <p className="text-sm font-extrabold text-indigo-700 dark:text-indigo-300 font-mono">09:00 AM & 02:00 PM</p>
          <p className="text-2xs text-ink-subtle">General guidance, not based on your data</p>
        </div>

        <div className="bg-surface border border-line p-4 rounded-2xl space-y-1">
          <span className="text-2xs font-bold uppercase tracking-wider text-ink-subtle">Channels (not connected)</span>
          <div className="flex items-center space-x-2 pt-1">
            <Linkedin className="w-4 h-4 text-blue-700 dark:text-blue-400" />
            <Instagram className="w-4 h-4 text-pink-700 dark:text-pink-400" />
            <Video className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            <Twitter className="w-4 h-4 text-sky-700 dark:text-sky-400" />
            <Facebook className="w-4 h-4 text-indigo-700 dark:text-indigo-300" />
          </div>
        </div>
      </div>
    </>
  );
}
