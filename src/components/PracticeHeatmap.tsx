import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { CalendarDays, Flame } from 'lucide-react';
import { PracticeSessionRecord } from '../hooks/useLearningStore';
import {
  buildPracticeHeatmapData,
  getLocalIsoDate,
  HeatmapDayDatum,
} from '../utils/learningLogic';

interface PracticeHeatmapProps {
  sessions: PracticeSessionRecord[];
  streakDays: number;
  lastPracticeDate: string;
  xpTotal: number;
}

const INTENSITY_COLORS = ['#fee2e2', '#bbf7d0', '#4ade80', '#16a34a', '#15803d'] as const;
const GREEN_SCALE_COLORS = ['#bbf7d0', '#4ade80', '#16a34a', '#15803d'] as const;
const WEEKDAY_LABELS = [
  { day: 1, label: 'Mon' },
  { day: 3, label: 'Wed' },
  { day: 5, label: 'Fri' },
];

export const PracticeHeatmap: React.FC<PracticeHeatmapProps> = ({
  sessions,
  streakDays,
  lastPracticeDate,
  xpTotal,
}) => {
  const [weeksWindow, setWeeksWindow] = useState<12 | 26>(26);
  const [selectedDateIso, setSelectedDateIso] = useState<string>(() => getLocalIsoDate());
  const svgRef = useRef<SVGSVGElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const summary = useMemo(
    () =>
      buildPracticeHeatmapData(sessions, {
        weeks: weeksWindow,
        todayIso: getLocalIsoDate(),
        profileStreakDays: streakDays,
        lastPracticeDate,
      }),
    [lastPracticeDate, sessions, streakDays, weeksWindow]
  );

  const activeDay = useMemo(() => {
    const found = summary.days.find((d) => d.dateIso === selectedDateIso && !d.isFuture);
    if (found) return found;
    const nonFuture = summary.days.filter((d) => !d.isFuture);
    return nonFuture[nonFuture.length - 1] ?? summary.days[0];
  }, [selectedDateIso, summary.days]);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const cellSize = 22;
    const cellGap = 5;
    const step = cellSize + cellGap;
    const marginLeft = 38;
    const marginTop = 24;
    const width = marginLeft + summary.weeksCount * step + 6;
    const height = marginTop + 7 * step + 6;

    const colorScale = d3
      .scaleOrdinal<number, string>()
      .domain([0, 1, 2, 3, 4])
      .range([...INTENSITY_COLORS]);

    const formatMonth = d3.timeFormat('%b');
    const formatFullDate = d3.timeFormat('%b %d, %Y');

    const svg = d3
      .select(svgEl)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', width)
      .attr('height', height);

    svg.selectAll('*').remove();

    // Month labels above week columns where a month starts (or first column)
    const monthPositions: Array<{ weekIndex: number; label: string }> = [];
    let prevMonth = -1;
    for (let w = 0; w < summary.weeksCount; w++) {
      const firstDayInWeek = summary.days.find((d) => d.weekIndex === w && !d.isFuture);
      if (!firstDayInWeek) continue;
      const month = firstDayInWeek.date.getMonth();
      if (month !== prevMonth) {
        if (w === 0 || monthPositions.length === 0 || w - monthPositions[monthPositions.length - 1].weekIndex >= 2) {
          monthPositions.push({ weekIndex: w, label: formatMonth(firstDayInWeek.date) });
        }
        prevMonth = month;
      }
    }

    svg
      .append('g')
      .attr('class', 'heatmap-months')
      .selectAll('text')
      .data(monthPositions)
      .join('text')
      .attr('x', (d) => marginLeft + d.weekIndex * step)
      .attr('y', 14)
      .attr('fill', '#64748b')
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .text((d) => d.label);

    // Weekday axis labels (Mon, Wed, Fri)
    svg
      .append('g')
      .attr('class', 'heatmap-weekdays')
      .selectAll('text')
      .data(WEEKDAY_LABELS)
      .join('text')
      .attr('x', 0)
      .attr('y', (d) => marginTop + d.day * step + cellSize / 2 + 4)
      .attr('fill', '#64748b')
      .attr('font-size', '11px')
      .attr('font-weight', '500')
      .text((d) => d.label);

    const visibleDays = summary.days.filter((d) => !d.isFuture);

    const cellsGroup = svg.append('g').attr('class', 'heatmap-cells');

    const rects = cellsGroup
      .selectAll<SVGRectElement, HeatmapDayDatum>('rect')
      .data(visibleDays, (d) => d.dateIso)
      .join('rect')
      .attr('x', (d) => marginLeft + d.weekIndex * step)
      .attr('y', (d) => marginTop + d.dayOfWeek * step)
      .attr('width', cellSize)
      .attr('height', cellSize)
      .attr('rx', 4)
      .attr('ry', 4)
      .attr('fill', (d) => colorScale(d.intensity))
      .attr('stroke', (d) => {
        if (d.dateIso === activeDay?.dateIso) return '#0f172a';
        if (d.isCurrentStreak) return '#065f46';
        if (d.count === 0) return '#fca5a5';
        return '#16a34a';
      })
      .attr('stroke-width', (d) => {
        if (d.dateIso === activeDay?.dateIso) return 2.2;
        if (d.isCurrentStreak) return 1.75;
        if (d.count === 0) return 1;
        return 0.75;
      })
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-pressed', (d) => (d.dateIso === activeDay?.dateIso ? 'true' : 'false'))
      .attr('aria-label', (d) => {
        const labelDate = formatFullDate(d.date);
        const sessionLabel =
          d.count === 0
            ? 'Missed day, 0 practice sessions'
            : `${d.count} ${d.count === 1 ? 'session' : 'sessions'}`;
        const streakSuffix = d.isCurrentStreak ? ', active streak day' : '';
        const consistentSuffix = d.isConsistentDay ? ', consistent practice day' : '';
        return `${labelDate}: ${sessionLabel}${streakSuffix}${consistentSuffix}`;
      })
      .style('cursor', 'pointer')
      .on('click', (_event, d) => {
        setSelectedDateIso(d.dateIso);
      })
      .on('mouseenter', (_event, d) => {
        setSelectedDateIso(d.dateIso);
      })
      .on('focus', (_event, d) => {
        setSelectedDateIso(d.dateIso);
      })
      .on('keydown', (event: KeyboardEvent, d) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setSelectedDateIso(d.dateIso);
        }
      });

    rects.append('title').text((d) => {
      const labelDate = formatFullDate(d.date);
      if (d.count === 0) return `${labelDate}: Missed day (0 sessions)`;
      return `${labelDate}: ${d.count} ${d.count === 1 ? 'session' : 'sessions'}${
        d.isCurrentStreak ? ' (Active Streak)' : ''
      }`;
    });

    // Subtle crisp dot for consistent multi-session / multi-day practice days
    cellsGroup
      .selectAll<SVGCircleElement, HeatmapDayDatum>('circle')
      .data(visibleDays.filter((d) => d.isConsistentDay), (d) => d.dateIso)
      .join('circle')
      .attr('cx', (d) => marginLeft + d.weekIndex * step + cellSize - 4.5)
      .attr('cy', (d) => marginTop + d.dayOfWeek * step + 4.5)
      .attr('r', 2.2)
      .attr('fill', (d) => (d.intensity >= 3 ? '#ffffff' : '#065f46'))
      .style('pointer-events', 'none');

    // Keep mobile horizontal scroll anchored to the latest month/today on mount, timeframe change, and resize
    const scrollToLatest = () => {
      const container = scrollContainerRef.current;
      if (container && container.scrollWidth > container.clientWidth) {
        container.scrollLeft = container.scrollWidth;
      }
    };

    const frameId = requestAnimationFrame(scrollToLatest);
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && scrollContainerRef.current) {
      let wasOverflowing =
        scrollContainerRef.current.scrollWidth > scrollContainerRef.current.clientWidth;
      resizeObserver = new ResizeObserver(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const isOverflowing = container.scrollWidth > container.clientWidth;
        if (isOverflowing && !wasOverflowing) {
          container.scrollLeft = container.scrollWidth;
        }
        wasOverflowing = isOverflowing;
      });
      resizeObserver.observe(scrollContainerRef.current);
    }

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
    };
  }, [activeDay?.dateIso, summary]);

  const formattedSelectedDate = useMemo(() => {
    if (!activeDay) return '';
    return d3.timeFormat('%a, %b %d, %Y')(activeDay.date);
  }, [activeDay]);

  return (
    <div className="space-y-4">
      {/* Header & Unboxed Summary Metrics */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-emerald-700" />
            <h3 className="text-sm font-bold text-slate-900">Practice Heatmap</h3>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
              <Flame className="h-3.5 w-3.5" />
              {summary.currentStreak} day streak
            </span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="font-mono-tabular">
              Best streak: <strong className="text-slate-900">{summary.longestStreak}d</strong>
            </span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="font-mono-tabular">
              Practiced: <strong className="text-emerald-700">{summary.activeDays}d</strong>
            </span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="font-mono-tabular">
              Missed: <strong className="text-red-700">{summary.missedDays}d</strong>
            </span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="font-mono-tabular">
              Consistent: <strong className="text-slate-900">{summary.consistentDays}d</strong>
            </span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="font-mono-tabular">
              {xpTotal} XP
            </span>
          </div>
        </div>

        {/* Segmented Range Selector */}
        <div
          className="inline-flex self-start rounded-xl bg-slate-100 p-1 sm:self-auto"
          role="group"
          aria-label="Heatmap timeframe"
        >
          {([12, 26] as const).map((weeks) => {
            const active = weeksWindow === weeks;
            return (
              <button
                key={weeks}
                type="button"
                aria-pressed={active}
                onClick={() => setWeeksWindow(weeks)}
                className={`min-h-[36px] rounded-lg px-3 text-xs font-semibold transition whitespace-nowrap ${
                  active
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {weeks === 12 ? '12 Weeks' : '6 Months'}
              </button>
            );
          })}
        </div>
      </div>

      {/* D3 Calendar SVG Container */}
      <div
        ref={scrollContainerRef}
        className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4"
      >
        <svg
          ref={svgRef}
          role="img"
          aria-label={`Daily speaking practice heatmap covering the last ${weeksWindow} weeks`}
          className={`block h-auto select-none ${
            weeksWindow === 26 ? 'w-full min-w-[680px]' : 'w-full max-w-[540px]'
          }`}
        />
      </div>

      {/* Selected Day Readout & Red/Green Legend */}
      <div className="flex flex-col gap-2 text-xs sm:flex-row sm:items-center sm:justify-between">
        <p aria-live="polite" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-700">
          <span className="font-semibold text-slate-900 whitespace-nowrap">{formattedSelectedDate}:</span>
          {activeDay?.count ? (
            <>
              <span className="whitespace-nowrap font-semibold text-emerald-700">
                {activeDay.count} speaking {activeDay.count === 1 ? 'session' : 'sessions'}
              </span>
              {activeDay.avgScore > 0 && (
                <>
                  <span aria-hidden="true" className="text-slate-300">
                    ·
                  </span>
                  <span className="font-mono-tabular whitespace-nowrap font-medium text-emerald-700">
                    Avg {activeDay.avgScore}%
                  </span>
                </>
              )}
              {activeDay.isCurrentStreak && (
                <>
                  <span aria-hidden="true" className="text-slate-300">
                    ·
                  </span>
                  <span className="whitespace-nowrap font-semibold text-emerald-800">Active streak day</span>
                </>
              )}
              {activeDay.isConsistentDay && (
                <>
                  <span aria-hidden="true" className="text-slate-300">
                    ·
                  </span>
                  <span className="whitespace-nowrap text-slate-600">Consistent practice</span>
                </>
              )}
            </>
          ) : (
            <span className="font-medium text-red-700">Missed day · 0 speaking sessions</span>
          )}
        </p>

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 rounded-[3px] border border-red-300 bg-red-100"
            />
            <span className="font-medium text-red-700">Missed</span>
          </span>

          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>

          <span className="inline-flex items-center gap-1.5">
            <span className="font-medium text-emerald-700">Practiced</span>
            {GREEN_SCALE_COLORS.map((hex, idx) => (
              <span
                key={hex}
                aria-hidden="true"
                className="inline-block h-3 w-3 rounded-[3px] border border-emerald-700/30"
                style={{ backgroundColor: hex }}
                title={`Practice level ${idx + 1}`}
              />
            ))}
          </span>

          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>

          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 rounded-[3px] border-[1.75px] border-emerald-900 bg-green-300"
            />
            <span>Streak</span>
          </span>

          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="relative inline-block h-3 w-3 rounded-[3px] border border-emerald-700/30 bg-green-300"
            >
              <span className="absolute right-[2px] top-[2px] h-1 w-1 rounded-full bg-emerald-900" />
            </span>
            <span>Consistent</span>
          </span>
        </div>
      </div>
    </div>
  );
};
