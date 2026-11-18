import React from 'react';
import { ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import type { SocialSchedulerState } from './useSocialScheduler';

export function CalendarToolbar({ s }: { s: SocialSchedulerState }) {
  const {
    currentYear,
    setCurrentYear,
    currentMonth,
    setCurrentMonth,
    selectedPlatformFilter,
    setSelectedPlatformFilter,
    selectedStatusFilter,
    setSelectedStatusFilter,
    monthNames,
    handlePrevMonth,
    handleNextMonth,
  } = s;
  return (
    <>
      {/* Calendar Control Bar (Month Navigation + Filters) */}
      <div className="bg-surface border border-line p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Month Navigation */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrevMonth}
              className="p-2 rounded-xl bg-canvas hover:bg-surface-muted text-ink border border-line transition-colors"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2 className="text-lg font-extrabold text-ink tracking-tight w-44 text-center">
              {monthNames[currentMonth]} {currentYear}
            </h2>
            <button
              onClick={handleNextMonth}
              className="p-2 rounded-xl bg-canvas hover:bg-surface-muted text-ink border border-line transition-colors"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => {
              setCurrentYear(new Date().getFullYear());
              setCurrentMonth(new Date().getMonth());
            }}
            className="text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:text-indigo-700 dark:hover:text-indigo-300 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60"
          >
            Today
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {/* Platform Filter */}
          <div className="flex items-center space-x-1.5 bg-canvas border border-line px-3 py-1.5 rounded-xl">
            <Filter className="w-3.5 h-3.5 text-ink-subtle" />
            <span className="text-ink-subtle font-semibold">Platform:</span>
            <select
              aria-label="Filter by platform"
              value={selectedPlatformFilter}
              onChange={(e) => setSelectedPlatformFilter(e.target.value)}
              className="bg-transparent text-ink font-bold outline-none cursor-pointer capitalize"
            >
              <option value="all" className="bg-surface">
                All Platforms
              </option>
              <option value="linkedin" className="bg-surface">
                LinkedIn
              </option>
              <option value="instagram" className="bg-surface">
                Instagram
              </option>
              <option value="tiktok" className="bg-surface">
                TikTok
              </option>
              <option value="twitter" className="bg-surface">
                X (Twitter)
              </option>
              <option value="facebook" className="bg-surface">
                Facebook
              </option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center space-x-1.5 bg-canvas border border-line px-3 py-1.5 rounded-xl">
            <span className="text-ink-subtle font-semibold">Status:</span>
            <select
              aria-label="Filter by status"
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="bg-transparent text-ink font-bold outline-none cursor-pointer"
            >
              <option value="all" className="bg-surface">
                All Statuses
              </option>
              <option value="scheduled" className="bg-surface">
                Scheduled Queue
              </option>
              <option value="published" className="bg-surface">
                Published
              </option>
            </select>
          </div>
        </div>
      </div>
    </>
  );
}
