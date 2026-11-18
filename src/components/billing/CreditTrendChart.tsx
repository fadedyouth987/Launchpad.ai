import React from 'react';
import { BarChart2, Calendar } from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { BillingLedgerState, DailyTrendPoint } from './useBillingLedger';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- recharts tooltip props
const CustomChartTooltip = ({ active, payload, isLight }: any) => {
  if (!active || !payload || !payload.length) return null;

  const dataPoint = payload[0]?.payload as DailyTrendPoint;

  return (
    <div
      className={`p-3.5 rounded-2xl border shadow-xl text-xs space-y-2 backdrop-blur-md max-w-xs ${
        isLight
          ? 'bg-white/95 border-slate-200 text-slate-800 shadow-slate-200'
          : 'bg-surface border-line-strong text-ink shadow-slate-950'
      }`}
    >
      <div className="flex items-center justify-between border-b pb-2 border-line-strong/50">
        <div className="flex items-center space-x-1.5">
          <Calendar className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
          <span className="font-bold">
            {dataPoint.dayOfWeek}, {dataPoint.shortDate}
          </span>
        </div>
        <span className="text-2xs font-mono text-ink-subtle">{dataPoint.date}</span>
      </div>

      <div className="space-y-1.5 font-mono">
        <div className="flex items-center justify-between text-amber-700 dark:text-amber-400">
          <span className="flex items-center space-x-1 text-2xs font-sans font-semibold">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>Credits Consumed:</span>
          </span>
          <span className="font-bold">-{dataPoint.consumed}</span>
        </div>

        {dataPoint.topup > 0 && (
          <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
            <span className="flex items-center space-x-1 text-2xs font-sans font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Credit Top-Up / Grant:</span>
            </span>
            <span className="font-bold">+{dataPoint.topup}</span>
          </div>
        )}

        <div className="flex items-center justify-between text-indigo-700 dark:text-indigo-300">
          <span className="flex items-center space-x-1 text-2xs font-sans font-semibold">
            <span className="w-2 h-2 rounded-full bg-indigo-400" />
            <span>Remaining Balance:</span>
          </span>
          <span className="font-bold">{dataPoint.balance.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
};

export function CreditTrendChart({ s }: { s: BillingLedgerState }) {
  const { timeRange, setTimeRange, chartMode, setChartMode, isLight, filteredTrendData, kpis } = s;
  return (
    <>
      {/* Recharts Credit Consumption Trend Section */}
      <div
        className={`border rounded-2xl p-6 space-y-6 ${
          isLight ? 'bg-white border-slate-200 shadow-md' : 'bg-surface border-line'
        }`}
      >
        {/* Controls Bar & Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b pb-4 border-line">
          <div>
            <div className="flex items-center space-x-2">
              <BarChart2 className="w-5 h-5 text-amber-700 dark:text-amber-400" />
              <h2 className={`text-base font-bold ${isLight ? 'text-slate-900' : 'text-ink'}`}>Credit usage</h2>
            </div>
            <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-600' : 'text-ink-subtle'}`}>
              Daily credits spent (net of refunds), credits added, and the resulting balance, from this workspace&apos;s
              ledger (latest 50 entries).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle */}
            <div
              className={`p-1 rounded-xl border flex items-center space-x-1 text-xs font-semibold ${
                isLight ? 'bg-slate-100 border-slate-200' : 'bg-canvas border-line'
              }`}
            >
              <button
                onClick={() => setChartMode('composed')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  chartMode === 'composed'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : isLight
                      ? 'text-slate-600 hover:text-slate-900'
                      : 'text-ink-subtle hover:text-ink'
                }`}
              >
                Burn & Balance
              </button>
              <button
                onClick={() => setChartMode('daily')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  chartMode === 'daily'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : isLight
                      ? 'text-slate-600 hover:text-slate-900'
                      : 'text-ink-subtle hover:text-ink'
                }`}
              >
                Daily Usage
              </button>
            </div>

            {/* Time Frame Selector */}
            <div
              className={`p-1 rounded-xl border flex items-center space-x-1 text-xs font-semibold ${
                isLight ? 'bg-slate-100 border-slate-200' : 'bg-canvas border-line'
              }`}
            >
              <button
                onClick={() => setTimeRange('7')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  timeRange === '7'
                    ? isLight
                      ? 'bg-white text-slate-900 shadow-sm font-bold'
                      : 'bg-surface-muted text-ink shadow-sm font-bold'
                    : isLight
                      ? 'text-slate-600'
                      : 'text-ink-subtle'
                }`}
              >
                7 Days
              </button>
              <button
                onClick={() => setTimeRange('14')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  timeRange === '14'
                    ? isLight
                      ? 'bg-white text-slate-900 shadow-sm font-bold'
                      : 'bg-surface-muted text-ink shadow-sm font-bold'
                    : isLight
                      ? 'text-slate-600'
                      : 'text-ink-subtle'
                }`}
              >
                14 Days
              </button>
              <button
                onClick={() => setTimeRange('30')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  timeRange === '30'
                    ? isLight
                      ? 'bg-white text-slate-900 shadow-sm font-bold'
                      : 'bg-surface-muted text-ink shadow-sm font-bold'
                    : isLight
                      ? 'text-slate-600'
                      : 'text-ink-subtle'
                }`}
              >
                30 Days
              </button>
            </div>
          </div>
        </div>

        {/* 4 Quick Stat Summary Badges for active window */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div
            className={`p-3.5 rounded-xl border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-canvas border-line/80'
            }`}
          >
            <span className="text-2xs text-ink-subtle block mb-1">Window Consumption ({timeRange}d)</span>
            <div className="flex items-baseline space-x-1.5 font-mono font-bold text-lg text-amber-700 dark:text-amber-400">
              <span>{kpis.totalConsumed.toLocaleString()}</span>
              <span className="text-xs font-sans text-ink-subtle font-normal">Credits</span>
            </div>
          </div>

          <div
            className={`p-3.5 rounded-xl border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-canvas border-line/80'
            }`}
          >
            <span className="text-2xs text-ink-subtle block mb-1">Avg Daily Burn Rate</span>
            <div
              className={`flex items-baseline space-x-1.5 font-mono font-bold text-lg ${
                isLight ? 'text-slate-800' : 'text-ink'
              }`}
            >
              <span>{kpis.avgDailyBurn}</span>
              <span className="text-xs font-sans text-ink-subtle font-normal">cr / day</span>
            </div>
          </div>

          <div
            className={`p-3.5 rounded-xl border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-canvas border-line/80'
            }`}
          >
            <span className="text-2xs text-ink-subtle block mb-1">Peak Consumption Day</span>
            <div className="flex items-baseline space-x-1.5 font-mono font-bold text-lg text-indigo-700 dark:text-indigo-300">
              <span>{kpis.peakDay.consumed} cr</span>
              <span className="text-xs font-sans text-ink-subtle font-normal">({kpis.peakDay.shortDate})</span>
            </div>
          </div>

          <div
            className={`p-3.5 rounded-xl border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-canvas border-line/80'
            }`}
          >
            <span className="text-2xs text-ink-subtle block mb-1">Projected Credit Runway</span>
            <div className="flex items-baseline space-x-1.5 font-mono font-bold text-lg text-emerald-700 dark:text-emerald-400">
              {kpis.estimatedRunwayDays === null ? (
                <span className="text-sm font-sans font-normal text-ink-subtle">No usage yet</span>
              ) : (
                <>
                  <span>~{kpis.estimatedRunwayDays}</span>
                  <span className="text-xs font-sans text-ink-subtle font-normal">days at this rate</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Main Recharts Visualization Canvas */}
        <div className="w-full h-80 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            {chartMode === 'composed' ? (
              <ComposedChart data={filteredTrendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorConsumed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={isLight ? '#e2e8f0' : '#1e293b'} vertical={false} />
                <XAxis
                  dataKey="shortDate"
                  tick={{ fill: isLight ? '#64748b' : '#94a3b8', fontSize: 11 }}
                  axisLine={{ stroke: isLight ? '#cbd5e1' : '#334155' }}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fill: isLight ? '#64748b' : '#94a3b8', fontSize: 11 }}
                  axisLine={{ stroke: isLight ? '#cbd5e1' : '#334155' }}
                  tickLine={false}
                  label={{ value: 'Daily Credits', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 10 }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: isLight ? '#64748b' : '#94a3b8', fontSize: 11 }}
                  axisLine={{ stroke: isLight ? '#cbd5e1' : '#334155' }}
                  tickLine={false}
                  label={{ value: 'Balance', angle: 90, position: 'insideRight', fill: '#94a3b8', fontSize: 10 }}
                />
                <Tooltip content={<CustomChartTooltip isLight={isLight} />} />
                <Legend
                  wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }}
                  formatter={(value) => (
                    <span className={isLight ? 'text-slate-700 font-medium' : 'text-ink-muted font-medium'}>
                      {value}
                    </span>
                  )}
                />

                <Bar
                  yAxisId="left"
                  dataKey="topup"
                  name="Credit Grants / Top-Ups"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                  barSize={12}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="consumed"
                  name="Daily Consumed"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorConsumed)"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="balance"
                  name="Credit Balance"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 6, fill: '#818cf8' }}
                />
              </ComposedChart>
            ) : (
              <BarChart data={filteredTrendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isLight ? '#e2e8f0' : '#1e293b'} vertical={false} />
                <XAxis dataKey="shortDate" tick={{ fill: isLight ? '#64748b' : '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: isLight ? '#64748b' : '#94a3b8', fontSize: 11 }} />
                <Tooltip content={<CustomChartTooltip isLight={isLight} />} />
                <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
                <Bar dataKey="consumed" name="Credits Consumed" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="topup" name="Credits Added" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}
