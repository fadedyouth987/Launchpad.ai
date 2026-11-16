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
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Month Navigation */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrevMonth}
              className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 transition-colors"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2 className="text-lg font-extrabold text-white tracking-tight w-44 text-center">
              {monthNames[currentMonth]} {currentYear}
            </h2>
            <button
              onClick={handleNextMonth}
              className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 transition-colors"
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
            className="text-xs font-bold text-indigo-300 hover:text-indigo-300 px-3 py-1.5 rounded-lg bg-indigo-950/60 border border-indigo-800/60"
          >
            Today
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {/* Platform Filter */}
          <div className="flex items-center space-x-1.5 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400 font-semibold">Platform:</span>
            <select
              aria-label="Filter by platform"
              value={selectedPlatformFilter}
              onChange={(e) => setSelectedPlatformFilter(e.target.value)}
              className="bg-transparent text-white font-bold outline-none cursor-pointer capitalize"
            >
              <option value="all" className="bg-slate-900">
                All Platforms
              </option>
              <option value="linkedin" className="bg-slate-900">
                LinkedIn
              </option>
              <option value="instagram" className="bg-slate-900">
                Instagram
              </option>
              <option value="tiktok" className="bg-slate-900">
                TikTok
              </option>
              <option value="twitter" className="bg-slate-900">
                X (Twitter)
              </option>
              <option value="facebook" className="bg-slate-900">
                Facebook
              </option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center space-x-1.5 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl">
            <span className="text-slate-400 font-semibold">Status:</span>
            <select
              aria-label="Filter by status"
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="bg-transparent text-white font-bold outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900">
                All Statuses
              </option>
              <option value="scheduled" className="bg-slate-900">
                Scheduled Queue
              </option>
              <option value="published" className="bg-slate-900">
                Published
              </option>
            </select>
          </div>
        </div>
      </div>
    </>
  );
}
