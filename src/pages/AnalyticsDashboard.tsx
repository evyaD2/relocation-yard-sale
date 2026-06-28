/**
 * @file AnalyticsDashboard.tsx
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  fetchItemViewsRaw,
  fetchItemSharesRaw,
  fetchStorefrontStats,
  fetchTotalShares,
} from '../api/items';
import type { ItemViewStat, DailyViewStat, StorefrontStats, ItemShareStat, ItemViewRaw, ItemShareRaw } from '../api/items';
import { BarChart2, Smartphone, Monitor, Tablet, TrendingUp, Eye, Store, Share2, Download, ArrowUp, ArrowDown, Table2 } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';

const LINE_COLORS = [
  '#1a1a1a', '#B5451B', '#1D6B5E', '#7B5EA7',
  '#C47D1A', '#1B4B83', '#8B2E4A', '#2E6B2E',
  '#A0522D', '#2E7D8B', '#6B3A6B', '#8B7D2E',
  '#4A7C59', '#B54B6B', '#3B5998', '#C47D5A',
  '#5E7B3A', '#7B3A5E', '#2E5E7B', '#7B5A2E',
];

function fmtDate(yyyymmdd: string): string {
  const [, m, d] = yyyymmdd.split('-');
  return `${d}/${m}`;
}

/** Returns YYYY-MM-DD in the browser's local timezone (matches the API helper). */
function localDateStr(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

// ── Client-side aggregation (so a single day can drill into hourly buckets) ────

/** Aggregates raw view rows into per-item totals + platform breakdown. */
function aggregateItemStats(rows: ItemViewRaw[]): ItemViewStat[] {
  const map = new Map<string, ItemViewStat>();
  for (const row of rows) {
    if (!map.has(row.item_id)) {
      map.set(row.item_id, {
        item_id: row.item_id,
        item_title: row.item_title,
        total_views: 0,
        mobile_views: 0,
        tablet_views: 0,
        desktop_views: 0,
      });
    }
    const stat = map.get(row.item_id)!;
    stat.total_views += 1;
    if (row.platform === 'mobile') stat.mobile_views += 1;
    else if (row.platform === 'tablet') stat.tablet_views += 1;
    else stat.desktop_views += 1;
  }
  return Array.from(map.values()).sort((a, b) => b.total_views - a.total_views);
}

/** Aggregates raw share rows into per-item totals. */
function aggregateShareStats(rows: ItemShareRaw[]): ItemShareStat[] {
  const map = new Map<string, ItemShareStat>();
  for (const row of rows) {
    if (!map.has(row.item_id)) {
      map.set(row.item_id, { item_id: row.item_id, item_title: row.item_title, total_shares: 0 });
    }
    map.get(row.item_id)!.total_shares += 1;
  }
  return Array.from(map.values()).sort((a, b) => b.total_shares - a.total_shares);
}

/** Daily totals across the last N days, zero-filled (dates in local time). */
function aggregateDaily(rows: ItemViewRaw[], days: number): DailyViewStat[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const date = localDateStr(new Date(row.viewed_at));
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  const result: DailyViewStat[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = localDateStr(d);
    result.push({ date: dateStr, views: counts.get(dateStr) ?? 0 });
  }
  return result;
}

/** A time bucket on the X-axis of the line chart (a day, or an hour within a day). */
interface ChartBucket {
  key: string;   // matrix key
  label: string; // X-axis label
}

/** Builds the line-chart buckets + per-item view matrix for the current view. */
function buildLineSeries(
  rows: ItemViewRaw[],
  dailyDates: string[],
  selectedDay: string | null,
): { buckets: ChartBucket[]; matrix: Record<string, Record<string, number>> } {
  const matrix: Record<string, Record<string, number>> = {};

  if (selectedDay) {
    // Hourly resolution within the selected day: buckets 00:00 … 23:00
    const buckets: ChartBucket[] = Array.from({ length: 24 }, (_, h) => ({
      key: String(h),
      label: `${String(h).padStart(2, '0')}:00`,
    }));
    for (const row of rows) {
      const d = new Date(row.viewed_at);
      if (localDateStr(d) !== selectedDay) continue;
      const key = String(d.getHours());
      (matrix[row.item_id] ??= {})[key] = (matrix[row.item_id]?.[key] ?? 0) + 1;
    }
    return { buckets, matrix };
  }

  // Daily resolution across the whole window
  const buckets: ChartBucket[] = dailyDates.map(date => ({ key: date, label: fmtDate(date) }));
  for (const row of rows) {
    const key = localDateStr(new Date(row.viewed_at));
    (matrix[row.item_id] ??= {})[key] = (matrix[row.item_id]?.[key] ?? 0) + 1;
  }
  return { buckets, matrix };
}

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 mb-6 border-b-[2px] border-jet pb-4">
      {icon}
      <span className="font-bold uppercase tracking-widest text-sm">{label}</span>
    </div>
  );
}

// ── Daily bar chart (clickable: select a day to drill the charts below) ────────
function DailyBarChart({
  stats,
  selectedDay,
  onSelectDay,
}: {
  stats: DailyViewStat[];
  selectedDay: string | null;
  onSelectDay: (date: string | null) => void;
}) {
  const maxVal = Math.max(...stats.map(d => d.views), 1);
  return (
    <div>
      <div className="flex items-stretch gap-1 h-28 w-full">
        {stats.map(({ date, views }) => {
          const heightPct = views === 0 ? 3 : Math.round((views / maxVal) * 100);
          const isSelected = selectedDay === date;
          const dimmed = selectedDay !== null && !isSelected;
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelectDay(isSelected ? null : date)}
              className={`flex-1 relative group flex flex-col justify-end cursor-pointer transition-opacity ${
                dimmed ? 'opacity-40 hover:opacity-70' : 'opacity-100'
              }`}
              title={`${fmtDate(date)}: ${views} view${views !== 1 ? 's' : ''} — click to focus this day`}
            >
              <span
                className={`absolute left-1/2 -translate-x-1/2 text-[10px] font-bold text-jet whitespace-nowrap pointer-events-none transition-opacity ${
                  isSelected ? 'opacity-100' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'
                }`}
                style={{ bottom: `calc(${heightPct}% + 4px)` }}
              >
                {views > 0 ? views : ''}
              </span>
              <div
                className={`w-full transition-all ${
                  isSelected ? 'bg-[#B5451B]' : 'bg-jet group-hover:bg-stone'
                }`}
                style={{ height: `${heightPct}%`, minHeight: '3px' }}
              />
            </button>
          );
        })}
      </div>
      <div className="flex justify-between mt-2">
        {stats.map(({ date }) => {
          const isSelected = selectedDay === date;
          return (
            <span
              key={date}
              className={`flex-1 text-center text-[8px] sm:text-[10px] font-bold leading-none ${
                isSelected ? 'text-[#B5451B]' : 'text-stone'
              }`}
            >
              {fmtDate(date)}
            </span>
          );
        })}
      </div>
      <p className="text-[9px] font-bold text-stone uppercase tracking-widest mt-3">
        {selectedDay
          ? <>Focused on {fmtDate(selectedDay)} · <button onClick={() => onSelectDay(null)} className="underline hover:text-jet transition-colors">Show all 12 days</button></>
          : 'Click a day to focus the charts below on that day'}
      </p>
    </div>
  );
}

// ── Top 3 Podium ──────────────────────────────────────────────────────────────
function Podium({ top3 }: { top3: ItemViewStat[] }) {
  if (top3.length === 0) return null;
  const medals = ['🥇', '🥈', '🥉'];
  const podiumOrder = top3.length >= 2 ? [top3[1], top3[0], top3[2]].filter(Boolean) : [top3[0]];
  const podiumHeights = top3.length >= 2 ? ['h-16', 'h-28', 'h-10'] : ['h-28'];
  const podiumColors = ['bg-stone/20', 'bg-jet text-surface', 'bg-stone/10'];

  return (
    <div className="flex items-end justify-center gap-2 sm:gap-4 px-4 pb-2">
      {podiumOrder.map((item, pos) => {
        const rank = top3.indexOf(item);
        return (
          <div key={item.item_id} className="flex flex-col items-center flex-1 max-w-[200px]">
            <div className="text-center mb-2">
              <span className="text-2xl">{medals[rank]}</span>
              <p className="text-lg font-bold text-jet leading-none">{item.total_views}</p>
              <p className="text-[9px] font-bold text-stone uppercase tracking-widest">views</p>
            </div>
            <p className="text-[10px] sm:text-xs font-bold text-jet leading-tight line-clamp-2 px-1 text-center mb-1">
              {item.item_title}
            </p>
            <div className={`w-full border-[3px] border-jet flex items-center justify-center font-bold text-xl ${podiumColors[pos]} ${podiumHeights[pos]}`}>
              <span className={pos === 1 ? 'text-surface' : 'text-jet'}>{rank + 1}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Interactive multi-line chart (Recharts) ───────────────────────────────────

interface TooltipEntry {
  dataKey?: string | number;
  value?: number;
  color?: string;
}

/** Custom tooltip styled to match the Editorial Brutalist design. */
function BrutalistTooltip({
  active,
  payload,
  label,
  visibleItems,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  visibleItems: { item_id: string; item_title: string; color: string }[];
}) {
  if (!active || !payload || payload.length === 0) return null;

  const visibleIds = new Set(visibleItems.map(i => i.item_id));

  // Sort by value descending, filter out 0s and non-visible items
  const rows = payload
    .filter((p: TooltipEntry) => (p.value ?? 0) > 0 && visibleIds.has(String(p.dataKey)))
    .sort((a: TooltipEntry, b: TooltipEntry) => (b.value ?? 0) - (a.value ?? 0));

  if (rows.length === 0) return null;

  return (
    <div className="bg-surface border-[3px] border-jet shadow-[4px_4px_0px_#1a1a1a] p-3 min-w-[160px] pointer-events-none">
      <p className="text-[9px] font-bold text-stone uppercase tracking-widest mb-2 pb-2 border-b-[1.5px] border-jet/20">
        {label}
      </p>
      <div className="space-y-1.5">
        {rows.map((entry: TooltipEntry) => (
          <div key={String(entry.dataKey)} className="flex items-center gap-2 text-[11px] font-bold text-jet">
            <span
              className="inline-block w-3 h-[3px] shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="truncate max-w-[140px]">
              {visibleItems.find(a => a.item_id === String(entry.dataKey))?.item_title ?? String(entry.dataKey)}
            </span>
            <span className="ml-auto tabular-nums">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ItemLineChart({
  buckets,
  matrix,
  itemStats,
  shareStats,
}: {
  buckets: ChartBucket[];
  matrix: Record<string, Record<string, number>>;
  itemStats: ItemViewStat[];
  shareStats: ItemShareStat[];
}) {
  // Legend-click selection state: Set of selected item_ids (empty = all visible)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Build share map (item_id → total_shares)
  const shareMap = new Map(shareStats.map(s => [s.item_id, s.total_shares]));

  // Show ALL items with any view in the last 12 days (no slice cap)
  const activeItems = itemStats.filter(s => s.total_views > 0).map((s, i) => ({
    ...s,
    color: LINE_COLORS[i % LINE_COLORS.length],
  }));
  if (activeItems.length === 0) return null;

  // Items highlighted in tooltip (all if none selected, otherwise just the selection)
  const visibleItems = selectedIds.size === 0
    ? activeItems
    : activeItems.filter(item => selectedIds.has(item.item_id));

  // Toggle an item in the selection set
  function toggleItem(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Transform data into Recharts-friendly format: [{ bucket: "17/04", item_id_1: 3, ... }]
  const chartData = buckets.map(({ key, label }) => {
    const point: Record<string, string | number> = { bucket: label };
    for (const item of activeItems) {
      point[item.item_id] = matrix[item.item_id]?.[key] ?? 0;
    }
    return point;
  });

  const hasSelection = selectedIds.size > 0;

  return (
    <div className="w-full">
      {/* Recharts line chart */}
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid
            strokeDasharray="4 3"
            stroke="#C9BFB3"
            strokeOpacity={0.5}
            vertical={false}
          />
          <XAxis
            dataKey="bucket"
            tick={{ fontSize: 10, fontWeight: 700, fill: '#555555' }}
            tickLine={false}
            axisLine={{ stroke: '#1a1a1a', strokeWidth: 2 }}
            interval={buckets.length > 16 ? 1 : 0}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 10, fontWeight: 700, fill: '#555555' }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            content={((props: any) => (
              <BrutalistTooltip active={props.active} payload={props.payload} label={props.label} visibleItems={visibleItems} />
            )) as any}
            cursor={{ stroke: '#1a1a1a', strokeWidth: 1.5, strokeDasharray: '4 3', opacity: 0.35 }}
            trigger="click"
          />
          {activeItems.map(item => {
            const isSelected = selectedIds.has(item.item_id);
            const dimmed = hasSelection && !isSelected;
            return (
              <Line
                key={item.item_id}
                type="monotone"
                dataKey={item.item_id}
                stroke={item.color}
                strokeWidth={isSelected ? 3.5 : 2}
                strokeOpacity={dimmed ? 0.12 : 1}
                dot={dimmed
                  ? { r: 0, strokeWidth: 0 }
                  : { r: 3, fill: item.color, strokeWidth: 0 }}
                activeDot={dimmed
                  ? { r: 0, strokeWidth: 0 }
                  : { r: 5, fill: item.color, stroke: '#FFFFFF', strokeWidth: 2 }}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>

      {/* Legend — click to select/deselect; shows share count */}
      {hasSelection && (
        <p className="text-[9px] font-bold text-stone uppercase tracking-widest mt-3">
          Click legend items to toggle · <button onClick={() => setSelectedIds(new Set())} className="underline hover:text-jet transition-colors">Clear selection</button>
        </p>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2 pt-4 border-t-[2px] border-jet">
        {activeItems.map(item => {
          const shares = shareMap.get(item.item_id) ?? 0;
          const isSelected = selectedIds.has(item.item_id);
          const dimmed = hasSelection && !isSelected;
          return (
            <button
              key={item.item_id}
              onClick={() => toggleItem(item.item_id)}
              className={`flex items-center gap-2 text-[11px] font-bold transition-opacity cursor-pointer select-none ${
                dimmed ? 'opacity-30' : 'opacity-100'
              } ${isSelected ? 'underline underline-offset-2' : ''} hover:opacity-100`}
              title={isSelected ? 'Click to deselect' : 'Click to highlight'}
            >
              <span
                className="inline-block w-4 h-[3px] shrink-0 transition-all"
                style={{
                  backgroundColor: item.color,
                  height: isSelected ? '4px' : '3px',
                }}
              />
              {item.item_title}
              <span className="text-stone">({item.total_views} views{shares > 0 ? ` · 📤 ${shares}` : ''})</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Vertical histogram (low→high) with 50th-pct marker ───────────────────────
function ItemHistogram({ stats }: { stats: ItemViewStat[] }) {
  if (!stats.length) return null;

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const ascending = [...stats].reverse();
  const n = ascending.length;
  const maxViews = ascending[n - 1].total_views;
  const total = stats.reduce((s, i) => s + i.total_views, 0);

  let accum = 0, cutoffDesc = n - 1;
  for (let i = 0; i < n; i++) {
    accum += stats[i].total_views;
    if (accum >= total * 0.5) { cutoffDesc = i; break; }
  }

  const firstAboveIdx = n - 1 - cutoffDesc;
  const linePct = (firstAboveIdx / n) * 100;

  return (
    <div>
      <div className="relative mt-8">
        {/* ── 50% Marker ── */}
        <div 
          className="absolute top-0 bottom-0 z-10 pointer-events-none transition-all duration-500 ease-out" 
          style={{ left: `${linePct}%` }}
        >
          <div className="absolute -top-7 -translate-x-1/2 whitespace-nowrap">
            <span className="text-[9px] font-bold text-stone uppercase tracking-widest border-[1.5px] border-stone/60 px-1.5 py-0.5 bg-oatmeal shadow-[2px_2px_0px_rgba(0,0,0,0.1)]">50%</span>
          </div>
          <div className="h-full border-l-[1.5px] border-dashed border-stone/70" />
        </div>

        {/* ── Bars Container ── */}
        <div className="flex h-44 items-stretch gap-0 overflow-visible relative">
          {ascending.map((stat, idx) => {
            const hPct = Math.max((stat.total_views / maxViews) * 100, 1.5);
            const isAbove = idx >= firstAboveIdx;
            const isSelected = selectedId === stat.item_id;
            const isLastOfGroup = idx === n - 1 || ascending[idx + 1].total_views !== stat.total_views;
            
            return (
              <div 
                key={stat.item_id} 
                className="group relative flex flex-col justify-end cursor-pointer" 
                style={{ flex: 1 }}
                onClick={() => setSelectedId(selectedId === stat.item_id ? null : stat.item_id)}
              >
                {isLastOfGroup && stat.total_views > 0 && (
                  <div
                    className={`absolute left-1/2 -translate-x-1/2 z-20 transition-all pointer-events-none ${
                        isSelected ? 'opacity-100 -translate-y-1' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'
                    }`}
                    style={{ bottom: `calc(${hPct}% + 6px)` }}
                  >
                    <div className="bg-jet text-surface text-[9px] font-bold px-2 py-0.5 whitespace-nowrap shadow-[2px_2px_0px_theme(colors.stone)]">
                      {stat.total_views}
                    </div>
                  </div>
                )}
                <div
                  style={{ height: `${hPct}%` }}
                  className={`w-full transition-colors ${
                    isSelected ? 'bg-[#A8B5A1]' : (isAbove ? 'bg-jet' : 'bg-stone/30 group-hover:bg-stone/50')
                  }`}
                />
              </div>
            );
          })}
        </div>

        <div className="h-[2px] w-full bg-jet" />
      </div>

      <div className="relative flex gap-0" style={{ height: '110px' }}>
        {ascending.map((stat) => (
          <div key={stat.item_id} className="relative" style={{ flex: 1, overflow: 'visible' }}>
            <span
              className="absolute text-[9px] font-bold text-stone"
              style={{ top: '6px', left: '50%', whiteSpace: 'nowrap', transformOrigin: 'top left', transform: 'rotate(45deg)' }}
              title={stat.item_title}
            >
              {stat.item_title}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 pt-4 border-t-[2px] border-jet text-[11px] font-bold">
        <span className="flex items-center gap-2">
          <span className="w-4 h-4 bg-jet border-[1px] border-jet shrink-0" />
          Top {cutoffDesc + 1} item{cutoffDesc > 0 ? 's' : ''} → 50% of all views
        </span>
        <span className="flex items-center gap-2">
          <span className="w-4 h-4 bg-stone/30 border-[1px] border-stone/50 shrink-0" />
          Remaining {n - cutoffDesc - 1} item{n - cutoffDesc - 1 !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}

// ── Per-item breakdown table (sortable, exportable) ───────────────────────────

interface BreakdownRow {
  item_id: string;
  item_title: string;
  total_views: number;
  total_shares: number;
  share_rate: number; // shares / views
  mobile_views: number;
  tablet_views: number;
  desktop_views: number;
  mobile_pct: number;
}

type SortKey = keyof Omit<BreakdownRow, 'item_id' | 'item_title'> | 'item_title';

function buildBreakdownRows(stats: ItemViewStat[], shareStats: ItemShareStat[]): BreakdownRow[] {
  const shareMap = new Map(shareStats.map(s => [s.item_id, s.total_shares]));
  return stats.map(s => {
    const total_shares = shareMap.get(s.item_id) ?? 0;
    return {
      item_id: s.item_id,
      item_title: s.item_title,
      total_views: s.total_views,
      total_shares,
      share_rate: s.total_views ? total_shares / s.total_views : 0,
      mobile_views: s.mobile_views,
      tablet_views: s.tablet_views,
      desktop_views: s.desktop_views,
      mobile_pct: s.total_views ? s.mobile_views / s.total_views : 0,
    };
  });
}

function exportBreakdownCsv(rows: BreakdownRow[]) {
  const header = ['Item', 'Views', 'Shares', 'Share Rate %', 'Mobile', 'Tablet', 'Desktop', 'Mobile %'];
  const body = rows.map(r => [
    `"${r.item_title.replace(/"/g, '""')}"`,
    r.total_views,
    r.total_shares,
    (r.share_rate * 100).toFixed(1),
    r.mobile_views,
    r.tablet_views,
    r.desktop_views,
    (r.mobile_pct * 100).toFixed(0),
  ].join(','));
  const csv = [header.join(','), ...body].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `analytics-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ItemBreakdownTable({ stats, shareStats }: { stats: ItemViewStat[]; shareStats: ItemShareStat[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('total_views');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

  const rows = buildBreakdownRows(stats, shareStats);
  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
    return dir === 'asc' ? cmp : -cmp;
  });

  function setSort(key: SortKey) {
    if (key === sortKey) setDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setDir(key === 'item_title' ? 'asc' : 'desc'); }
  }

  const cols: { key: SortKey; label: string; numeric: boolean }[] = [
    { key: 'item_title', label: 'Item', numeric: false },
    { key: 'total_views', label: 'Views', numeric: true },
    { key: 'total_shares', label: 'Shares', numeric: true },
    { key: 'share_rate', label: 'Share %', numeric: true },
    { key: 'mobile_views', label: 'Mobile', numeric: true },
    { key: 'tablet_views', label: 'Tablet', numeric: true },
    { key: 'desktop_views', label: 'Desktop', numeric: true },
  ];

  const fmt = (r: BreakdownRow, key: SortKey): string => {
    if (key === 'item_title') return r.item_title;
    if (key === 'share_rate') return `${(r.share_rate * 100).toFixed(0)}%`;
    return String(r[key]);
  };

  return (
    <div className="-mx-2 sm:mx-0 overflow-x-auto">
      <table className="w-full border-collapse text-sm min-w-[560px]">
        <thead>
          <tr className="border-b-[2px] border-jet">
            {cols.map(col => {
              const active = sortKey === col.key;
              return (
                <th
                  key={col.key}
                  onClick={() => setSort(col.key)}
                  className={`py-2.5 px-3 font-bold uppercase tracking-wider text-[10px] cursor-pointer select-none whitespace-nowrap hover:bg-oatmeal transition-colors ${
                    col.numeric ? 'text-right' : 'text-left'
                  } ${active ? 'text-jet' : 'text-stone'}`}
                >
                  <span className={`inline-flex items-center gap-1 ${col.numeric ? 'flex-row-reverse' : ''}`}>
                    {col.label}
                    {active
                      ? (dir === 'asc' ? <ArrowUp size={11} strokeWidth={3} /> : <ArrowDown size={11} strokeWidth={3} />)
                      : <span className="w-[11px] inline-block" />}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.item_id} className={`border-b border-border-subtle hover:bg-oatmeal transition-colors ${i % 2 ? 'bg-oatmeal/40' : ''}`}>
              {cols.map(col => (
                <td
                  key={col.key}
                  className={`py-2 px-3 ${col.numeric ? 'text-right tabular-nums font-bold' : 'font-medium max-w-[220px] truncate'} ${
                    col.key === 'item_title' ? 'text-jet' : 'text-jet'
                  } ${col.key === 'share_rate' && r.share_rate >= 0.15 ? 'text-[#1D6B5E]' : ''}`}
                  title={col.key === 'item_title' ? r.item_title : undefined}
                >
                  {fmt(r, col.key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
const WINDOW_DAYS = 12;

export default function AnalyticsDashboard() {
  const [rawViews, setRawViews] = useState<ItemViewRaw[]>([]);
  const [rawShares, setRawShares] = useState<ItemShareRaw[]>([]);
  const [storefrontStats, setStorefrontStats] = useState<StorefrontStats>({ total: 0, last12Days: 0 });
  const [totalShares, setTotalShares] = useState({ total: 0, last12Days: 0 });
  const [loading, setLoading] = useState(true);

  // Day drill-down: when set, every chart below the daily bar chart focuses on
  // this single day (YYYY-MM-DD) and the time-series chart switches to hours.
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchItemViewsRaw(WINDOW_DAYS),
      fetchItemSharesRaw(WINDOW_DAYS),
      fetchStorefrontStats(),
      fetchTotalShares(),
    ]).then(([views, shares, storefront, sharesTotal]) => {
      setRawViews(views);
      setRawShares(shares);
      setStorefrontStats(storefront);
      setTotalShares(sharesTotal);
      setLoading(false);
    });
  }, []);

  // ── Full-window aggregates (summary cards + daily bar chart never filter) ──
  const dailyStats = useMemo(() => aggregateDaily(rawViews, WINDOW_DAYS), [rawViews]);
  const itemStatsAll = useMemo(() => aggregateItemStats(rawViews), [rawViews]);

  // ── Day-filtered rows that feed every chart below the daily bar chart ──
  const focusViews = useMemo(
    () => (selectedDay ? rawViews.filter(r => localDateStr(new Date(r.viewed_at)) === selectedDay) : rawViews),
    [rawViews, selectedDay],
  );
  const focusShares = useMemo(
    () => (selectedDay ? rawShares.filter(r => localDateStr(new Date(r.shared_at)) === selectedDay) : rawShares),
    [rawShares, selectedDay],
  );
  const itemStats = useMemo(() => aggregateItemStats(focusViews), [focusViews]);
  const shareStats = useMemo(() => aggregateShareStats(focusShares), [focusShares]);

  const dailyDates = useMemo(() => dailyStats.map(d => d.date), [dailyStats]);
  const { buckets: lineBuckets, matrix: lineMatrix } = useMemo(
    () => buildLineSeries(rawViews, dailyDates, selectedDay),
    [rawViews, dailyDates, selectedDay],
  );

  if (loading) {
    return (
      <div className="animate-pulse text-xl border-[3px] border-jet p-6 bg-surface">
        Loading Analytics...
      </div>
    );
  }

  // Summary cards always reflect the full 12-day window, independent of drill-down.
  const totalItemViews = itemStatsAll.reduce((s, i) => s + i.total_views, 0);
  const totalMobile = itemStatsAll.reduce((s, i) => s + i.mobile_views, 0);
  const totalTablet = itemStatsAll.reduce((s, i) => s + i.tablet_views, 0);
  const totalDesktop = itemStatsAll.reduce((s, i) => s + i.desktop_views, 0);
  const mobilePercent = totalItemViews ? Math.round((totalMobile / totalItemViews) * 100) : 0;
  const tabletPercent = totalItemViews ? Math.round((totalTablet / totalItemViews) * 100) : 0;
  const desktopPercent = totalItemViews ? Math.round((totalDesktop / totalItemViews) * 100) : 0;

  // Below-chart aggregates honour the selected day.
  const focusViewsTotal = itemStats.reduce((s, i) => s + i.total_views, 0);
  const top3 = itemStats.slice(0, 3);

  const summaryCards = [
    { label: 'Store Visitors', value: storefrontStats.last12Days, sub: `${storefrontStats.total} all-time`, icon: <Store size={15} strokeWidth={2.5} /> },
    { label: 'Item Views (12d)', value: totalItemViews, sub: 'unique item opens', icon: <Eye size={15} strokeWidth={2.5} /> },
    { label: 'Shares (12d)', value: totalShares.last12Days, sub: `${totalShares.total} all-time`, icon: <Share2 size={15} strokeWidth={2.5} /> },
    { label: 'Mobile', value: `${mobilePercent}%`, sub: `${totalMobile} views`, icon: <Smartphone size={15} strokeWidth={2.5} /> },
    { label: 'Tablet', value: `${tabletPercent}%`, sub: `${totalTablet} views`, icon: <Tablet size={15} strokeWidth={2.5} /> },
    { label: 'Desktop', value: `${desktopPercent}%`, sub: `${totalDesktop} views`, icon: <Monitor size={15} strokeWidth={2.5} /> },
  ];

  const overallShareRate = totalItemViews ? Math.round((totalShares.last12Days / totalItemViews) * 100) : 0;
  const breakdownRows = buildBreakdownRows(itemStats, shareStats);

  // Suffix appended to the headers of every drill-down-aware section.
  const focusSuffix = selectedDay ? ` — ${fmtDate(selectedDay)}` : '';

  return (
    <div className="space-y-8">

      {/* ── 0. Toolbar ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone">Reporting window</p>
          {selectedDay ? (
            <p className="font-bold text-jet">
              Focused on {fmtDate(selectedDay)} · {focusViewsTotal.toLocaleString()} item views ·{' '}
              <button onClick={() => setSelectedDay(null)} className="underline hover:text-stone transition-colors">Back to 12 days</button>
            </p>
          ) : (
            <p className="font-bold text-jet">Last 12 days · {totalItemViews.toLocaleString()} item views · {overallShareRate}% share rate</p>
          )}
        </div>
        <button
          onClick={() => exportBreakdownCsv(breakdownRows)}
          disabled={breakdownRows.length === 0}
          className="flex items-center gap-2 font-bold border-[2px] border-jet px-4 py-2.5 text-xs uppercase tracking-widest bg-surface hover:bg-jet hover:text-surface transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-[3px_3px_0px_theme(colors.jet)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
        >
          <Download size={14} strokeWidth={2.5} /> Export CSV
        </button>
      </div>

      {/* ── 1. Summary Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {summaryCards.map(({ label, value, sub, icon }) => (
          <div key={label} className="bg-surface border-[3px] border-jet p-4 shadow-[4px_4px_0px_theme(colors.jet)]">
            <div className="flex items-center gap-1.5 text-stone text-[10px] font-bold uppercase tracking-widest mb-2">
              {icon}
              <span className="leading-tight">{label}</span>
            </div>
            <p className="text-2xl font-bold text-jet leading-none">{value}</p>
            {sub && <p className="text-[10px] text-stone mt-1">{sub}</p>}
          </div>
        ))}
      </div>

      {/* ── 2. Daily Trend (clickable) ── */}
      <div className="bg-surface border-[3px] border-jet p-6 shadow-[4px_4px_0px_theme(colors.jet)]">
        <SectionHeader icon={<TrendingUp size={18} strokeWidth={2.5} />} label="Item Views — Last 12 Days" />
        <DailyBarChart stats={dailyStats} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
      </div>

      {/* ── 3. Top 3 Podium ── */}
      {top3.length >= 1 && (
        <div className="bg-surface border-[3px] border-jet p-6 shadow-[4px_4px_0px_theme(colors.jet)]">
          <SectionHeader icon={<span className="text-lg">🏆</span>} label={`Top 3 Most Viewed${focusSuffix}`} />
          <Podium top3={top3} />
        </div>
      )}

      {/* ── 4. Interactive per-item line chart (hourly when a day is selected) ── */}
      {itemStats.length > 0 && (
        <div className="bg-surface border-[3px] border-jet p-6 shadow-[4px_4px_0px_theme(colors.jet)] overflow-visible">
          <SectionHeader
            icon={<BarChart2 size={18} strokeWidth={2.5} />}
            label={selectedDay ? `Item Performance by Hour${focusSuffix}` : 'Item Performance Over 12 Days'}
          />
          <ItemLineChart
            buckets={lineBuckets}
            matrix={lineMatrix}
            itemStats={itemStats}
            shareStats={shareStats}
          />
        </div>
      )}

      {/* ── 5. Histogram + 50th Percentile ── */}
      {itemStats.length > 0 ? (
        <div className="bg-surface border-[3px] border-jet p-6 shadow-[4px_4px_0px_theme(colors.jet)] overflow-visible">
          <SectionHeader icon={<BarChart2 size={18} strokeWidth={2.5} />} label={selectedDay ? `Item View Ranking${focusSuffix}` : 'Item View Ranking — Last 12 Days'} />
          <ItemHistogram stats={itemStats} />
        </div>
      ) : (
        <div className="border-[3px] border-jet p-10 bg-surface text-center">
          <BarChart2 size={48} className="mx-auto mb-4 text-stone" strokeWidth={1.5} />
          <p className="font-bold text-xl text-jet">
            {selectedDay ? `No item views on ${fmtDate(selectedDay)}.` : 'No item views in the last 12 days.'}
          </p>
          <p className="text-stone mt-2 text-sm">
            {selectedDay
              ? <button onClick={() => setSelectedDay(null)} className="underline hover:text-jet transition-colors">Back to the full 12-day window</button>
              : 'Open some items on the storefront to start collecting data.'}
          </p>
        </div>
      )}

      {/* ── 6. Full data breakdown table ── */}
      {itemStats.length > 0 && (
        <div className="bg-surface border-[3px] border-jet p-6 shadow-[4px_4px_0px_theme(colors.jet)]">
          <div className="flex items-center justify-between gap-3 mb-6 border-b-[2px] border-jet pb-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Table2 size={18} strokeWidth={2.5} />
              <span className="font-bold uppercase tracking-widest text-sm">Item Breakdown{focusSuffix}</span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-stone">Tap a column to sort</span>
          </div>
          <ItemBreakdownTable stats={itemStats} shareStats={shareStats} />
        </div>
      )}
    </div>
  );
}
