/**
 * @file AnalyticsDashboard.tsx
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 */

import { useState, useEffect } from 'react';
import {
  fetchItemViewStats,
  fetchDailyViewStats,
  fetchStorefrontStats,
  fetchItemDailyStats,
  fetchItemShareStats,
  fetchTotalShares,
} from '../api/items';
import type { ItemViewStat, DailyViewStat, StorefrontStats, ItemDailyStat, ItemShareStat } from '../api/items';
import { BarChart2, Smartphone, Monitor, Tablet, TrendingUp, Eye, Store, Share2 } from 'lucide-react';
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

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 mb-6 border-b-[2px] border-jet pb-4">
      {icon}
      <span className="font-bold uppercase tracking-widest text-sm">{label}</span>
    </div>
  );
}

// ── Daily bar chart ───────────────────────────────────────────────────────────
function DailyBarChart({ stats }: { stats: DailyViewStat[] }) {
  const maxVal = Math.max(...stats.map(d => d.views), 1);
  return (
    <div>
      <div className="flex items-stretch gap-1 h-28 w-full">
        {stats.map(({ date, views }) => {
          const heightPct = views === 0 ? 3 : Math.round((views / maxVal) * 100);
          return (
            <div
              key={date}
              className="flex-1 relative group flex flex-col justify-end"
              title={`${fmtDate(date)}: ${views} view${views !== 1 ? 's' : ''}`}
            >
              <span
                className="absolute left-1/2 -translate-x-1/2 text-[10px] font-bold text-jet opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none"
                style={{ bottom: `calc(${heightPct}% + 4px)` }}
              >
                {views > 0 ? views : ''}
              </span>
              <div
                className="w-full bg-jet transition-all group-hover:bg-stone"
                style={{ height: `${heightPct}%`, minHeight: '3px' }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-2">
        {stats.map(({ date }) => (
          <span key={date} className="flex-1 text-center text-[8px] sm:text-[10px] font-bold text-stone leading-none">
            {fmtDate(date)}
          </span>
        ))}
      </div>
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
  dates,
  itemStats,
  rawRows,
  shareStats,
}: {
  dates: string[];
  itemStats: ItemViewStat[];
  rawRows: ItemDailyStat[];
  shareStats: ItemShareStat[];
}) {
  // Legend-click selection state: Set of selected item_ids (empty = all visible)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Build view matrix
  const matrix: Record<string, Record<string, number>> = {};
  for (const row of rawRows) {
    if (!matrix[row.item_id]) matrix[row.item_id] = {};
    matrix[row.item_id][row.date] = row.views;
  }

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

  // Transform data into Recharts-friendly format: [{ date: "17/04", item_id_1: 3, item_id_2: 5, ... }]
  const chartData = dates.map(date => {
    const point: Record<string, string | number> = { date: fmtDate(date) };
    for (const item of activeItems) {
      point[item.item_id] = matrix[item.item_id]?.[date] ?? 0;
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
            dataKey="date"
            tick={{ fontSize: 10, fontWeight: 700, fill: '#555555' }}
            tickLine={false}
            axisLine={{ stroke: '#1a1a1a', strokeWidth: 2 }}
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

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function AnalyticsDashboard() {
  const [itemStats, setItemStats] = useState<ItemViewStat[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyViewStat[]>([]);
  const [storefrontStats, setStorefrontStats] = useState<StorefrontStats>({ total: 0, last12Days: 0 });
  const [itemDailyRows, setItemDailyRows] = useState<ItemDailyStat[]>([]);
  const [shareStats, setShareStats] = useState<ItemShareStat[]>([]);
  const [totalShares, setTotalShares] = useState({ total: 0, last12Days: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchItemViewStats(12),
      fetchDailyViewStats(12),
      fetchStorefrontStats(),
      fetchItemDailyStats(12),
      fetchItemShareStats(12),
      fetchTotalShares(),
    ]).then(([items, daily, storefront, itemDaily, shares, sharesTotal]) => {
      setItemStats(items);
      setDailyStats(daily);
      setStorefrontStats(storefront);
      setItemDailyRows(itemDaily);
      setShareStats(shares);
      setTotalShares(sharesTotal);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse text-xl border-[3px] border-jet p-6 bg-surface">
        Loading Analytics...
      </div>
    );
  }

  const totalItemViews = itemStats.reduce((s, i) => s + i.total_views, 0);
  const totalMobile = itemStats.reduce((s, i) => s + i.mobile_views, 0);
  const totalTablet = itemStats.reduce((s, i) => s + i.tablet_views, 0);
  const totalDesktop = itemStats.reduce((s, i) => s + i.desktop_views, 0);
  const mobilePercent = totalItemViews ? Math.round((totalMobile / totalItemViews) * 100) : 0;
  const tabletPercent = totalItemViews ? Math.round((totalTablet / totalItemViews) * 100) : 0;
  const desktopPercent = totalItemViews ? Math.round((totalDesktop / totalItemViews) * 100) : 0;

  const chartDates = [...new Set(itemDailyRows.map(r => r.date))].sort();
  const top3 = itemStats.slice(0, 3);

  const summaryCards = [
    { label: 'Store Visitors', value: storefrontStats.last12Days, sub: `${storefrontStats.total} all-time`, icon: <Store size={15} strokeWidth={2.5} /> },
    { label: 'Item Views (12d)', value: totalItemViews, sub: 'unique item opens', icon: <Eye size={15} strokeWidth={2.5} /> },
    { label: 'Shares (12d)', value: totalShares.last12Days, sub: `${totalShares.total} all-time`, icon: <Share2 size={15} strokeWidth={2.5} /> },
    { label: 'Mobile', value: `${mobilePercent}%`, sub: `${totalMobile} views`, icon: <Smartphone size={15} strokeWidth={2.5} /> },
    { label: 'Tablet', value: `${tabletPercent}%`, sub: `${totalTablet} views`, icon: <Tablet size={15} strokeWidth={2.5} /> },
    { label: 'Desktop', value: `${desktopPercent}%`, sub: `${totalDesktop} views`, icon: <Monitor size={15} strokeWidth={2.5} /> },
  ];

  return (
    <div className="space-y-8">

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

      {/* ── 2. Daily Trend ── */}
      <div className="bg-surface border-[3px] border-jet p-6 shadow-[4px_4px_0px_theme(colors.jet)]">
        <SectionHeader icon={<TrendingUp size={18} strokeWidth={2.5} />} label="Item Views — Last 12 Days" />
        <DailyBarChart stats={dailyStats} />
      </div>

      {/* ── 3. Top 3 Podium ── */}
      {top3.length >= 1 && (
        <div className="bg-surface border-[3px] border-jet p-6 shadow-[4px_4px_0px_theme(colors.jet)]">
          <SectionHeader icon={<span className="text-lg">🏆</span>} label="Top 3 Most Viewed" />
          <Podium top3={top3} />
        </div>
      )}

      {/* ── 4. Interactive per-item line chart ── */}
      {chartDates.length > 0 && (
        <div className="bg-surface border-[3px] border-jet p-6 shadow-[4px_4px_0px_theme(colors.jet)] overflow-visible">
          <SectionHeader icon={<BarChart2 size={18} strokeWidth={2.5} />} label="Item Performance Over 12 Days" />
          <ItemLineChart
            dates={chartDates}
            itemStats={itemStats}
            rawRows={itemDailyRows}
            shareStats={shareStats}
          />
        </div>
      )}

      {/* ── 5. Histogram + 50th Percentile ── */}
      {itemStats.length > 0 ? (
        <div className="bg-surface border-[3px] border-jet p-6 shadow-[4px_4px_0px_theme(colors.jet)] overflow-visible">
          <SectionHeader icon={<BarChart2 size={18} strokeWidth={2.5} />} label="Item View Ranking — Last 12 Days" />
          <ItemHistogram stats={itemStats} />
        </div>
      ) : (
        <div className="border-[3px] border-jet p-10 bg-surface text-center">
          <BarChart2 size={48} className="mx-auto mb-4 text-stone" strokeWidth={1.5} />
          <p className="font-bold text-xl text-jet">No item views in the last 12 days.</p>
          <p className="text-stone mt-2 text-sm">Open some items on the storefront to start collecting data.</p>
        </div>
      )}
    </div>
  );
}
