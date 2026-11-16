import React from 'react';
import { AITrendMonitor } from './AITrendMonitor';
import { useSocialScheduler, type SocialSchedulerProps } from './scheduler/useSocialScheduler';
import { SchedulerHeader } from './scheduler/SchedulerHeader';
import { CalendarToolbar } from './scheduler/CalendarToolbar';
import { CalendarGrid } from './scheduler/CalendarGrid';
import { ScheduleModal } from './scheduler/ScheduleModal';

/** Social Scheduler: monthly drag-and-drop calendar, quick scheduling and the AI trend monitor. */
export const SocialScheduler: React.FC<SocialSchedulerProps> = (props) => {
  const s = useSocialScheduler(props);
  return (
    <div className="space-y-8 w-full">
      <SchedulerHeader s={s} />
      <CalendarToolbar s={s} />
      <CalendarGrid s={s} />
      <AITrendMonitor workspaceId={props.currentWorkspace.id} onQueueTrendToScheduler={s.handleQueueTrendToScheduler} />
      {s.isScheduleModalOpen && <ScheduleModal s={s} />}
    </div>
  );
};
