'use client';

/**
 * Social-Blade-style "last 30 days" follower-count chart, built on
 * shadcn/ui's chart helper (Recharts under the hood).
 *
 * Previously a ~170 LOC hand-rolled SVG (zero-dep). It looked squished
 * on narrow viewports — y-axis labels overlapped the plot area and the
 * 30-tick x-axis density was hard to size for. Swapped to a shadcn
 * Area chart with a soft brand-color gradient for better breathing
 * room + a tokenised tooltip. Bundle cost: recharts pulls ~90KB into
 * the per-page chunk on the one page that imports it (the creator
 * detail page); accepted for the visual win.
 *
 * Behavioural parity with the old chart:
 *   - Filters out all-zero series (SB sometimes stamps 0 sentinels).
 *   - Empty + all-zero data → "first snapshot will appear" placeholder.
 *   - Single-point data → flat line across the chart (synthesised
 *     2-point series so Recharts has something to render).
 *   - X-axis labels in "May 26" format, ~5 ticks max.
 *   - Y-axis ticks formatted with the same K / M shortener the panel
 *     uses (1.2K / 3.4M).
 *
 * Prop interface kept identical to the previous version
 * (`{ points, metricLabel }`) so the parent panel doesn't change. A
 * new optional `height` is exposed for callers that want a taller
 * chart on detail pages.
 */
import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts';

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

export interface HistoryPoint {
  day: string; // ISO yyyy-mm-dd
  followers: number;
}

interface HistoryChartProps {
  points: HistoryPoint[];
  /** Platform label only used in the tooltip — e.g. "Instagram followers". */
  metricLabel?: string;
  /** Override the default chart height (px). Default 180. */
  height?: number;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtDayShort(iso: string): string {
  // e.g. "May 26"
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Pick ~5 evenly-spaced ticks from a labelled series so the x-axis
 *  stays legible even with 30 data points. Always includes the last
 *  index so the most recent day is labelled. */
function pickTicks(days: string[]): string[] {
  if (days.length <= 5) return days;
  const target = 5;
  const step = Math.max(1, Math.floor(days.length / (target - 1)));
  const out: string[] = [];
  for (let i = 0; i < days.length; i += step) out.push(days[i]!);
  const last = days[days.length - 1]!;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

export function HistoryChart({
  points,
  metricLabel = 'Followers',
  height = 180,
}: HistoryChartProps) {
  // Hooks must run before any early return — declare data prep here.
  const real = useMemo(() => (points ?? []).filter((p) => p.followers > 0), [points]);

  // Synthesise a 2-point series when there's exactly one snapshot so
  // Recharts has a domain to plot across — the line renders flat
  // across the full width, matching the legacy SVG behaviour.
  const series = useMemo(() => {
    if (real.length === 1) {
      const only = real[0]!;
      return [
        { day: only.day, followers: only.followers, label: fmtDayShort(only.day) },
        { day: only.day, followers: only.followers, label: fmtDayShort(only.day) },
      ];
    }
    return real.map((p) => ({
      day: p.day,
      followers: p.followers,
      label: fmtDayShort(p.day),
    }));
  }, [real]);

  const ticks = useMemo(
    () => pickTicks(series.map((s) => s.label)),
    [series],
  );

  if (!points || points.length === 0 || real.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/40 px-4 py-6 text-center text-xs text-muted-foreground">
        No history yet — first snapshot will appear after the next daily scrape.
      </div>
    );
  }

  const chartConfig: ChartConfig = {
    followers: {
      label: metricLabel,
      color: 'hsl(var(--primary))',
    },
  };

  return (
    <div
      className="overflow-hidden rounded-lg border border-border bg-card/60"
      role="img"
      aria-label={`${metricLabel} over the last ${real.length} days`}
    >
      <ChartContainer
        config={chartConfig}
        // Override the helper's default aspect-video — we want a fixed
        // pixel height so the chart sizes the same on every viewport
        // width. The container internally uses ResponsiveContainer for
        // width, so flex/responsive parents still drive the width.
        className="aspect-auto w-full"
        style={{ height }}
      >
        <AreaChart
          data={series}
          margin={{ top: 8, right: 8, bottom: 4, left: 8 }}
        >
          <defs>
            <linearGradient id="historyFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            ticks={ticks}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            width={44}
            tickCount={4}
            tickFormatter={(v: number) => fmt(v)}
            domain={['auto', 'auto']}
          />
          <ChartTooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={
              <ChartTooltipContent
                indicator="line"
                labelFormatter={(_v, payload) => {
                  const day = payload?.[0]?.payload?.day as string | undefined;
                  return day ? fmtDayShort(day) : '';
                }}
              />
            }
          />
          <Area
            dataKey="followers"
            type="monotone"
            stroke="hsl(var(--primary))"
            strokeWidth={1.75}
            fill="url(#historyFill)"
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 3.5 }}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}
