import React from 'react';
import { Plus, GripVertical } from 'lucide-react';
import type { SocialSchedulerState } from './useSocialScheduler';

export function CalendarGrid({ s }: { s: SocialSchedulerState }) {
  const {
    onPublishNow,
    dragOverDateStr,
    daysOfWeek,
    monthGridDays,
    assetsByDate,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleOpenScheduleModalForDate,
    renderPlatformIcon,
    getPlatformBg,
  } = s;
  return (
    <>
      {/* MONTHLY DRAG & DROP CALENDAR GRID */}
      <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-2xl">
        {/* Days of Week Header */}
        <div className="grid grid-cols-7 border-b border-line bg-canvas text-center text-xs font-bold text-ink-subtle py-3">
          {daysOfWeek.map((day) => (
            <div key={day} className="uppercase tracking-wider">
              {day}
            </div>
          ))}
        </div>

        {/* Month Day Cells */}
        <div className="grid grid-cols-7 divide-x divide-y divide-line/80 bg-canvas">
          {monthGridDays.map((dayObj, idx) => {
            const { dateStr, dayNum, isCurrentMonth } = dayObj;
            const dayPosts = assetsByDate[dateStr] || [];
            const isToday = dateStr === s.todayKey;
            const isDragTarget = dragOverDateStr === dateStr;

            return (
              <div
                key={idx}
                onDragOver={(e) => handleDragOver(e, dateStr)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, dateStr)}
                className={`min-h-[140px] p-2 transition-all flex flex-col justify-between group relative ${
                  !isCurrentMonth ? 'bg-canvas opacity-60' : 'bg-surface hover:bg-surface'
                } ${isDragTarget ? 'ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-950/40' : ''}`}
              >
                {/* Cell Header: Date Number + Quick Add Button */}
                <div className="flex items-center justify-between text-xs mb-2">
                  <span
                    className={`font-mono font-bold w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                      isToday
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/40 ring-2 ring-indigo-400'
                        : isCurrentMonth
                          ? 'text-ink-muted'
                          : 'text-ink-muted'
                    }`}
                  >
                    {dayNum}
                  </span>

                  <button
                    onClick={() => handleOpenScheduleModalForDate(dateStr)}
                    className="p-1 hover:bg-surface-muted text-ink-muted hover:text-indigo-700 dark:hover:text-indigo-300 rounded transition-all"
                    title={`Schedule post for ${dateStr}`}
                    aria-label={`Add a post on ${dateStr}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Posts Stacked List inside Day Cell */}
                <div className="space-y-1.5 flex-1 overflow-y-auto max-h-[110px] pr-0.5">
                  {dayPosts.map((post) => {
                    const isPublished = post.status === 'published';

                    return (
                      <div
                        key={post.id}
                        draggable={!isPublished}
                        onDragStart={(e) => handleDragStart(e, post.id)}
                        className={`p-2 rounded-xl border text-2xs transition-all space-y-1 shadow-sm cursor-grab active:cursor-grabbing ${getPlatformBg(
                          post.platform,
                        )} hover:scale-[1.02]`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-1 truncate">
                            <GripVertical className="w-2.5 h-2.5 text-ink-subtle shrink-0" />
                            {renderPlatformIcon(post.platform)}
                            <span className="font-extrabold truncate">{post.title}</span>
                          </div>

                          <span
                            className={`text-2xs font-mono px-1.5 py-0.2 rounded font-bold shrink-0 ${
                              isPublished
                                ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                : 'bg-surface text-indigo-700 dark:text-indigo-300 border border-line'
                            }`}
                          >
                            {isPublished ? 'Published' : '09:00 AM'}
                          </span>
                        </div>

                        <p className="text-2xs text-ink-muted line-clamp-1 leading-snug font-medium">{post.caption}</p>

                        {!isPublished && (
                          <div className="flex items-center justify-between pt-1 border-t border-line/60 text-2xs">
                            <span className="text-ink-subtle">Drag to move</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onPublishNow(post.id);
                              }}
                              className="text-indigo-700 dark:text-indigo-300 hover:text-ink font-bold underline"
                            >
                              Dispatch
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Drop indicator outline */}
                {isDragTarget && (
                  <div className="absolute inset-0 bg-indigo-500/10 border-2 border-dashed border-indigo-400 rounded-xl pointer-events-none flex items-center justify-center">
                    <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-canvas px-2 py-1 rounded border border-indigo-500">
                      Drop to Reschedule
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
