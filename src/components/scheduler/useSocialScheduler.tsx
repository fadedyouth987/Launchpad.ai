import React, { useState } from 'react';
import { Linkedin, Instagram, Twitter, Facebook, Video, Globe } from 'lucide-react';
import type { Workspace, CampaignAsset, Platform, AIInfluencer } from '../../types';

export interface SocialSchedulerProps {
  currentWorkspace: Workspace;
  assets: CampaignAsset[];
  influencers: AIInfluencer[];
  onUpdateAssetSchedule: (assetId: string, newScheduledTime: string, newStatus?: 'scheduled' | 'published') => void;
  onPublishNow: (assetId: string) => void;
  onQuickScheduleNewPost: (title: string, caption: string, platform: Platform, scheduledTime: string) => void;
}

/** Local calendar date as YYYY-MM-DD. */
export function localDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** State, derived data and actions for SocialScheduler. */
export function useSocialScheduler(props: SocialSchedulerProps) {
  const { currentWorkspace, assets, influencers, onUpdateAssetSchedule, onPublishNow, onQuickScheduleNewPost } = props;
  // Calendar opens on the real current month.
  const todayKey = localDateKey();
  const [currentYear, setCurrentYear] = useState<number>(() => new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(() => new Date().getMonth()); // 0-indexed

  // Filters
  const [selectedPlatformFilter, setSelectedPlatformFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');

  // Drag & Drop State
  const [draggedAssetId, setDraggedAssetId] = useState<string | null>(null);
  const [dragOverDateStr, setDragOverDateStr] = useState<string | null>(null);

  // Modal State for New Scheduled Post
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState<boolean>(false);
  const [targetModalDateStr, setTargetModalDateStr] = useState<string>(todayKey);
  const [modalTitle, setModalTitle] = useState<string>('');
  const [modalCaption, setModalCaption] = useState<string>('');
  const [modalPlatform, setModalPlatform] = useState<Platform>('linkedin');
  const [modalTime, setModalTime] = useState<string>('09:00');
  const [selectedExistingAssetId, setSelectedExistingAssetId] = useState<string>('');

  // Message shown after "Mark queue as published"
  const [dispatchNotification, setDispatchNotification] = useState<string | null>(null);

  // Month Names
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Helper: Get days matrix for current month
  const getDaysInMonth = (year: number, month: number) => {
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    const days: { date: Date; dateStr: string; dayNum: number; isCurrentMonth: boolean }[] = [];

    // Previous month padding
    const prevMonthTotalDays = new Date(year, month, 0).getDate();
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const prevDayNum = prevMonthTotalDays - i;
      const d = new Date(year, month - 1, prevDayNum);
      const dateStr = localDateKey(d);
      days.push({ date: d, dateStr, dayNum: prevDayNum, isCurrentMonth: false });
    }

    // Current month days
    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(year, month, day);
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      days.push({ date: d, dateStr, dayNum: day, isCurrentMonth: true });
    }

    // Next month padding to fill 35 or 42 grid cells
    const remainingCells = (7 - (days.length % 7)) % 7;
    for (let day = 1; day <= remainingCells; day++) {
      const d = new Date(year, month + 1, day);
      const dateStr = localDateKey(d);
      days.push({ date: d, dateStr, dayNum: day, isCurrentMonth: false });
    }

    return days;
  };

  const monthGridDays = getDaysInMonth(currentYear, currentMonth);

  // Filter Workspace Assets
  const workspaceAssets = assets.filter((a) => a.workspaceId === currentWorkspace.id);

  // Filter assets by platform and status for calendar rendering
  const filteredAssets = workspaceAssets.filter((a) => {
    if (selectedPlatformFilter !== 'all' && a.platform !== selectedPlatformFilter) return false;
    if (selectedStatusFilter === 'scheduled' && a.status !== 'scheduled' && a.status !== 'approved') return false;
    if (selectedStatusFilter === 'published' && a.status !== 'published') return false;
    return true;
  });

  // Map assets by date string YYYY-MM-DD
  const assetsByDate: Record<string, CampaignAsset[]> = {};
  filteredAssets.forEach((asset) => {
    // Only posts with a real date are placed on the calendar (no invented dates).
    const when = asset.scheduledTime || asset.decidedAt;
    if (!when) return;
    // Local calendar day (times are stored in UTC).
    const t = new Date(when);
    const dateKey = Number.isNaN(t.getTime()) ? when.split('T')[0] : localDateKey(t);

    if (!assetsByDate[dateKey]) {
      assetsByDate[dateKey] = [];
    }
    assetsByDate[dateKey].push(asset);
  });

  // Navigation Handlers
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((prev) => prev - 1);
    } else {
      setCurrentMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((prev) => prev + 1);
    } else {
      setCurrentMonth((prev) => prev + 1);
    }
  };

  // Drag & Drop Handlers
  const handleDragStart = (e: React.DragEvent, assetId: string) => {
    setDraggedAssetId(assetId);
    e.dataTransfer.setData('text/plain', assetId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverDateStr !== dateStr) {
      setDragOverDateStr(dateStr);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverDateStr(null);
  };

  const handleDrop = (e: React.DragEvent, targetDateStr: string) => {
    e.preventDefault();
    setDragOverDateStr(null);
    const assetId = e.dataTransfer.getData('text/plain') || draggedAssetId;

    if (assetId) {
      // 09:00 in the user's own time zone (stored as UTC ISO).
      const newScheduledTime = new Date(`${targetDateStr}T09:00:00`).toISOString();
      onUpdateAssetSchedule(assetId, newScheduledTime, 'scheduled');
      setDraggedAssetId(null);

      setDispatchNotification(`Post rescheduled to ${targetDateStr} at 09:00 AM`);
      setTimeout(() => setDispatchNotification(null), 3500);
    }
  };

  // Publish every queued (scheduled/approved) post now. LinkedIn posts are really posted (when LinkedIn
  // is connected); other platforms are marked published and handed off through webhooks.
  const handleTriggerAutoDispatch = () => {
    const dueAssets = workspaceAssets.filter((a) => a.status === 'scheduled' || a.status === 'approved');
    if (!dueAssets.length) {
      setDispatchNotification('No queued posts to publish.');
      setTimeout(() => setDispatchNotification(null), 4000);
      return;
    }
    const li = dueAssets.filter((a) => a.platform === 'linkedin').length;
    if (
      !window.confirm(
        `Publish all ${dueAssets.length} queued post${dueAssets.length === 1 ? '' : 's'} now, ignoring their scheduled times?` +
          (li ? `\n\n${li} LinkedIn post${li === 1 ? '' : 's'} will be posted to LinkedIn immediately.` : ''),
      )
    )
      return;
    dueAssets.forEach((asset) => onPublishNow(asset.id));
    setDispatchNotification(
      `Publishing ${dueAssets.length} queued post${dueAssets.length === 1 ? '' : 's'}${li ? ` (${li} to LinkedIn)` : ''}. Other networks are handed off via webhooks.`,
    );
    setTimeout(() => setDispatchNotification(null), 6000);
  };

  // Open Schedule Modal for specific date
  const handleOpenScheduleModalForDate = (dateStr: string) => {
    setTargetModalDateStr(dateStr);
    setIsScheduleModalOpen(true);
  };

  // Handle Queueing Trend from AI Trend Monitor
  const handleQueueTrendToScheduler = (title: string, caption: string, platform: Platform, _hashtags: string[]) => {
    setModalTitle(title);
    setModalCaption(caption);
    setModalPlatform(platform);
    setTargetModalDateStr(todayKey);
    setIsScheduleModalOpen(true);
  };

  // Handle Save Scheduled Post in Modal
  const handleSaveModalPost = () => {
    // The time picked is local time; store it as UTC so it posts when the user expects.
    const fullISO = new Date(`${targetModalDateStr}T${modalTime}:00`).toISOString();

    if (selectedExistingAssetId) {
      onUpdateAssetSchedule(selectedExistingAssetId, fullISO, 'scheduled');
    } else if (modalTitle.trim()) {
      onQuickScheduleNewPost(modalTitle, modalCaption, modalPlatform, fullISO);
    }

    setIsScheduleModalOpen(false);
    setModalTitle('');
    setModalCaption('');
    setSelectedExistingAssetId('');
    setDispatchNotification(`Successfully queued post for ${targetModalDateStr} at ${modalTime}`);
    setTimeout(() => setDispatchNotification(null), 3500);
  };

  // Helper: Render platform icon
  const renderPlatformIcon = (platform: Platform) => {
    switch (platform) {
      case 'linkedin':
        return <Linkedin className="w-3 h-3 text-blue-400" />;
      case 'instagram':
        return <Instagram className="w-3 h-3 text-pink-400" />;
      case 'tiktok':
        return <Video className="w-3 h-3 text-teal-400" />;
      case 'twitter':
        return <Twitter className="w-3 h-3 text-sky-400" />;
      case 'facebook':
        return <Facebook className="w-3 h-3 text-indigo-300" />;
      default:
        return <Globe className="w-3 h-3 text-slate-400" />;
    }
  };

  // Helper: Get platform bg color
  const getPlatformBg = (platform: Platform) => {
    switch (platform) {
      case 'linkedin':
        return 'bg-blue-950/80 border-blue-800/80 text-blue-200';
      case 'instagram':
        return 'bg-pink-950/80 border-pink-800/80 text-pink-200';
      case 'tiktok':
        return 'bg-teal-950/80 border-teal-800/80 text-teal-200';
      case 'twitter':
        return 'bg-sky-950/80 border-sky-800/80 text-sky-200';
      case 'facebook':
        return 'bg-indigo-950/80 border-indigo-800/80 text-indigo-200';
      default:
        return 'bg-slate-900 border-slate-800 text-slate-300';
    }
  };

  const totalScheduledMonth = filteredAssets.filter((a) => a.status === 'scheduled' || a.status === 'approved').length;
  const totalPublishedMonth = filteredAssets.filter((a) => a.status === 'published').length;

  return {
    currentWorkspace,
    assets,
    influencers,
    onUpdateAssetSchedule,
    onPublishNow,
    onQuickScheduleNewPost,
    currentYear,
    todayKey,
    setCurrentYear,
    currentMonth,
    setCurrentMonth,
    selectedPlatformFilter,
    setSelectedPlatformFilter,
    selectedStatusFilter,
    setSelectedStatusFilter,
    draggedAssetId,
    setDraggedAssetId,
    dragOverDateStr,
    setDragOverDateStr,
    isScheduleModalOpen,
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
    dispatchNotification,
    setDispatchNotification,
    monthNames,
    daysOfWeek,
    getDaysInMonth,
    monthGridDays,
    workspaceAssets,
    filteredAssets,
    assetsByDate,
    handlePrevMonth,
    handleNextMonth,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleTriggerAutoDispatch,
    handleOpenScheduleModalForDate,
    handleQueueTrendToScheduler,
    handleSaveModalPost,
    renderPlatformIcon,
    getPlatformBg,
    totalScheduledMonth,
    totalPublishedMonth,
  };
}

export type SocialSchedulerState = ReturnType<typeof useSocialScheduler>;
