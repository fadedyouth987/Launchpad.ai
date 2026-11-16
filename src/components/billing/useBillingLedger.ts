import { useMemo, useState } from 'react';
import type { Workspace, LedgerEntry } from '../../types';

export interface DailyTrendPoint {
  date: string;
  shortDate: string;
  dayOfWeek: string;
  consumed: number;
  topup: number;
  balance: number;
}

export interface BillingLedgerProps {
  currentWorkspace: Workspace;
  ledgerEntries: LedgerEntry[];
  onOpenTopUp: () => void;
  onOpenPlanModal: () => void;
  themeMode?: 'light' | 'dark';
}

/** State, derived data and actions for BillingLedger. */
export function useBillingLedger(props: BillingLedgerProps) {
  const { currentWorkspace, ledgerEntries, onOpenTopUp, onOpenPlanModal, themeMode = 'dark' } = props;
  const [timeRange, setTimeRange] = useState<'30' | '14' | '7'>('30');
  const [chartMode, setChartMode] = useState<'composed' | 'daily'>('composed');
  const isLight = themeMode === 'light';

  const workspaceEntries = ledgerEntries.filter((e) => e.workspaceId === currentWorkspace.id);

  // 30-day series built only from real ledger entries (no synthetic data). Net consumption per day
  // = charges minus refunds; additions = grants, purchases and top-ups. The balance line is worked
  // backwards from the current balance. Covers the entries the server returned (latest 50).
  const full30DayTrend = useMemo<DailyTrendPoint[]>(() => {
    const dayKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const days: Date[] = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (29 - i));
      return d;
    });
    const byDay = new Map<string, { consumed: number; topup: number }>(
      days.map((d) => [dayKey(d), { consumed: 0, topup: 0 }]),
    );
    for (const entry of ledgerEntries) {
      if (entry.workspaceId !== currentWorkspace.id) continue;
      const t = new Date(entry.timestamp);
      if (Number.isNaN(t.getTime())) continue;
      const bucket = byDay.get(dayKey(t));
      if (!bucket) continue;
      const amount = Number(entry.amountCredits) || 0;
      if (entry.type === 'reservation' || entry.type === 'deduction') bucket.consumed += Math.abs(amount);
      else if (entry.type === 'refund') bucket.consumed -= Math.abs(amount);
      else if (amount > 0) bucket.topup += amount;
    }
    const raw = days.map((d) => ({ d, ...byDay.get(dayKey(d))! }));
    const balances: number[] = new Array(30);
    balances[29] = currentWorkspace.creditsRemaining;
    for (let i = 28; i >= 0; i--) balances[i] = balances[i + 1] + raw[i + 1].consumed - raw[i + 1].topup;
    return raw.map((r, i) => ({
      date: dayKey(r.d),
      shortDate: r.d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      dayOfWeek: r.d.toLocaleDateString('en-US', { weekday: 'short' }),
      consumed: Math.max(0, r.consumed),
      topup: r.topup,
      balance: Math.max(0, balances[i]),
    }));
  }, [currentWorkspace, ledgerEntries]);

  // Filter trend data according to active time range (30, 14, 7 days)
  const filteredTrendData = useMemo(() => {
    const days = parseInt(timeRange, 10);
    return full30DayTrend.slice(30 - days);
  }, [full30DayTrend, timeRange]);

  // Key KPI metrics calculations
  const kpis = useMemo(() => {
    const totalConsumed = filteredTrendData.reduce((acc, curr) => acc + curr.consumed, 0);
    const totalTopups = filteredTrendData.reduce((acc, curr) => acc + curr.topup, 0);
    const days = filteredTrendData.length;
    const avgDailyBurn = days > 0 ? (totalConsumed / days).toFixed(1) : '0';

    let peakDay = filteredTrendData[0] || { shortDate: 'N/A', consumed: 0 };
    filteredTrendData.forEach((p) => {
      if (p.consumed > peakDay.consumed) {
        peakDay = p;
      }
    });

    const avgBurnNum = parseFloat(avgDailyBurn);
    // null = no usage in the window, so no meaningful projection.
    const estimatedRunwayDays = avgBurnNum > 0 ? Math.round(currentWorkspace.creditsRemaining / avgBurnNum) : null;

    return {
      totalConsumed,
      totalTopups,
      avgDailyBurn,
      peakDay,
      estimatedRunwayDays,
    };
  }, [filteredTrendData, currentWorkspace.creditsRemaining]);

  return {
    currentWorkspace,
    ledgerEntries,
    onOpenTopUp,
    onOpenPlanModal,
    themeMode,
    timeRange,
    setTimeRange,
    chartMode,
    setChartMode,
    isLight,
    workspaceEntries,
    full30DayTrend,
    filteredTrendData,
    kpis,
  };
}

export type BillingLedgerState = ReturnType<typeof useBillingLedger>;
