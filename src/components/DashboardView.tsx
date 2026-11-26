import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  ArrowRight,
  CalendarDays,
  Flame,
  Mic,
  PhoneCall,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { PersonaAppearance, PERSONA_PROFILES } from '../data/curriculum';
import { useLearningStore } from '../hooks/useLearningStore';
import {
  buildDashboardProgressSummary,
  buildPracticeHeatmapData,
  CefrLevel,
  FluencyTrendPoint,
  getLocalIsoDate,
} from '../utils/learningLogic';
import { PersonaAvatarVisualizer } from './PersonaAvatarVisualizer';

interface DashboardViewProps {
  selectedPersonaId: PersonaAppearance;
  onStartVoiceCall: (personaId?: PersonaAppearance) => void;
  onOpenHeatmap: () => void;
}

const CEFR_LEVELS: CefrLevel[] = ['A2', 'B1', 'B2', 'C1'];

export const DashboardView: React.FC<DashboardViewProps> = ({
  selectedPersonaId,
  onStartVoiceCall,
  onOpenHeatmap,
}) => {
  const { profile, sessions, updatePreferences } = useLearningStore();
  const todayIso = getLocalIsoDate();

  const dashboard = useMemo(
    () => buildDashboardProgressSummary(sessions, todayIso),
    [sessions, todayIso]
  );

  const heatmapSummary = useMemo(
    () =>
      buildPracticeHeatmapData(sessions, {
        weeks: 12,
        todayIso,
        profileStreakDays: profile.streakDays,
        lastPracticeDate: profile.lastPracticeDate,
      }),
    [profile.lastPracticeDate, profile.streakDays, sessions, todayIso]
  );

  const last7Days = useMemo(() => {
    const nonFuture = heatmapSummary.days.filter((d) => !d.isFuture);
    return nonFuture.slice(-7);
  }, [heatmapSummary.days]);

  const speakingSessions = useMemo(
    () => sessions.filter((s) => !s.mode || s.mode === 'tutor'),
    [sessions]
  );

  const quickPartners = useMemo(() => PERSONA_PROFILES.slice(0, 4), []);

  const [hoveredPoint, setHoveredPoint] = useState<FluencyTrendPoint | null>(null);
  const trendSvgRef = useRef<SVGSVGElement | null>(null);

  const activePoint =
    hoveredPoint ??
    dashboard.trendPoints[dashboard.trendPoints.length - 1] ??
    null;

  useEffect(() => {
    const svgEl = trendSvgRef.current;
    if (!svgEl) return;

    const points = dashboard.trendPoints;
    const width = 560;
    const height = 190;
    const margin = { top: 18, right: 20, bottom: 28, left: 36 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = d3
      .select(svgEl)
      .attr('viewBox', `0 0 ${width} ${height}`);

    svg.selectAll('*').remove();

    if (points.length === 0) return;

    const xScale = d3
      .scalePoint<number>()
      .domain(points.map((p) => p.index))
      .range([0, innerW])
      .padding(0.25);

    const yScale = d3.scaleLinear().domain([50, 100]).range([innerH, 0]);

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Subtle horizontal grid lines at 60, 80, 100
    const yTicks = [60, 80, 100];
    g.append('g')
      .selectAll('line')
      .data(yTicks)
      .join('line')
      .attr('x1', 0)
      .attr('x2', innerW)
      .attr('y1', (d) => yScale(d))
      .attr('y2', (d) => yScale(d))
      .attr('stroke', '#e2e8f0')
      .attr('stroke-dasharray', '3,3');

    g.append('g')
      .selectAll('text')
      .data(yTicks)
      .join('text')
      .attr('x', -8)
      .attr('y', (d) => yScale(d) + 3.5)
      .attr('text-anchor', 'end')
      .attr('fill', '#64748b')
      .attr('font-size', '10px')
      .text((d) => `${d}%`);

    if (points.length >= 2) {
      const area = d3
        .area<FluencyTrendPoint>()
        .x((d) => xScale(d.index) ?? 0)
        .y0(innerH)
        .y1((d) => yScale(Math.max(50, d.score)))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(points)
        .attr('fill', 'rgba(22, 163, 74, 0.12)')
        .attr('d', area);

      const line = d3
        .line<FluencyTrendPoint>()
        .x((d) => xScale(d.index) ?? 0)
        .y((d) => yScale(Math.max(50, d.score)))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(points)
        .attr('fill', 'none')
        .attr('stroke', '#16a34a')
        .attr('stroke-width', 2.25)
        .attr('d', line);
    }

    // X-axis date labels (show first, middle, last cleanly)
    const xLabelPoints = points.filter(
      (_p, idx) =>
        idx === 0 ||
        idx === points.length - 1 ||
        (points.length >= 5 && idx === Math.floor(points.length / 2))
    );

    g.append('g')
      .selectAll('text')
      .data(xLabelPoints)
      .join('text')
      .attr('x', (d) => xScale(d.index) ?? 0)
      .attr('y', innerH + 18)
      .attr('text-anchor', 'middle')
      .attr('fill', '#64748b')
      .attr('font-size', '10px')
      .text((d) => d.label);

    g.append('g')
      .selectAll<SVGCircleElement, FluencyTrendPoint>('circle')
      .data(points)
      .join('circle')
      .attr('cx', (d) => xScale(d.index) ?? 0)
      .attr('cy', (d) => yScale(Math.max(50, d.score)))
      .attr('r', (d) => (activePoint?.index === d.index ? 6 : 4.5))
      .attr('fill', (d) => (activePoint?.index === d.index ? '#0f172a' : '#16a34a'))
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('mouseenter', (_event, d) => setHoveredPoint(d))
      .on('click', (_event, d) => setHoveredPoint(d));
  }, [activePoint?.index, dashboard.trendPoints]);

  return (
    <div className="space-y-6">
      {/* Hero Progress Overview */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold text-emerald-700">
              Welcome back, {profile.displayName} · ZenvoxSpeak Progress Dashboard
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Track Your Speaking Momentum &amp; Fluency Growth
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Daily goal: {profile.dailyGoalMinutes} min · Review your consistency, monitor fluency scores over time, or jump straight into a live two-way voice call.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center shrink-0">
            <button
              type="button"
              onClick={() => onStartVoiceCall(selectedPersonaId)}
              className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 whitespace-nowrap"
            >
              <PhoneCall className="h-4 w-4" />
              <span>Start Voice Call</span>
            </button>

            <button
              type="button"
              onClick={onOpenHeatmap}
              className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 whitespace-nowrap"
            >
              <CalendarDays className="h-4 w-4 text-emerald-700" />
              <span>Practice Heatmap</span>
            </button>
          </div>
        </div>

        {/* Speaking Level Selector */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Target CEFR level:</span>
            <div className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1">
              {CEFR_LEVELS.map((lvl) => {
                const active = profile.level === lvl;
                return (
                  <button
                    key={lvl}
                    type="button"
                    aria-pressed={active}
                    onClick={() => updatePreferences({ level: lvl })}
                    className={`min-h-[34px] rounded-lg px-2.5 text-xs font-semibold transition whitespace-nowrap ${
                      active
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {lvl}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="font-mono-tabular text-xs text-slate-500">
            Today: {dashboard.sessionsToday} speaking{' '}
            {dashboard.sessionsToday === 1 ? 'call' : 'calls'} · Last 7 days:{' '}
            {dashboard.sessionsLast7Days}
          </p>
        </div>
      </section>

      {/* 4 Key KPI Cards */}
      <section aria-label="Progress metrics" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500">
            <span>Current Streak</span>
            <Flame className="h-4 w-4 text-emerald-700" />
          </div>
          <p className="font-mono-tabular mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">
            {heatmapSummary.currentStreak}d
          </p>
          <p className="font-mono-tabular mt-1 text-xs text-slate-500">
            Best streak: {heatmapSummary.longestStreak}d
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500">
            <span>Average Fluency</span>
            <TrendingUp className="h-4 w-4 text-emerald-700" />
          </div>
          <p className="font-mono-tabular mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">
            {dashboard.averageScore}%
          </p>
          <p className="font-mono-tabular mt-1 text-xs text-slate-500">
            Best score: {dashboard.bestScore}%
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500">
            <span>Speaking Calls</span>
            <Mic className="h-4 w-4 text-emerald-700" />
          </div>
          <p className="font-mono-tabular mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">
            {dashboard.totalCalls}
          </p>
          <p className="font-mono-tabular mt-1 text-xs text-slate-500">
            {heatmapSummary.activeDays} active days (12w)
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500">
            <span>Total XP</span>
            <Sparkles className="h-4 w-4 text-emerald-700" />
          </div>
          <p className="font-mono-tabular mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">
            {profile.xpTotal}
          </p>
          <p className="font-mono-tabular mt-1 text-xs text-slate-500">
            Level {profile.level} · {heatmapSummary.consistentDays} consistent days
          </p>
        </div>
      </section>

      {/* Main Analytics & Quick Launch Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 7 Cols: D3 Fluency Score Trend + 7-Day Red/Green Consistency Strip */}
        <div className="space-y-6 lg:col-span-7">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900">Fluency Score Progression</h2>
                <p className="text-xs text-slate-500">
                  {activePoint
                    ? `${activePoint.label} · ${activePoint.topic} · ${activePoint.score}%`
                    : 'Complete voice calls to chart your fluency trend'}
                </p>
              </div>
              <span className="font-mono-tabular text-xs font-semibold text-emerald-700">
                Avg {dashboard.averageScore}%
              </span>
            </div>

            {dashboard.trendPoints.length === 0 ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
                <p className="text-sm text-slate-600">No speaking calls logged yet.</p>
                <button
                  type="button"
                  onClick={() => onStartVoiceCall(selectedPersonaId)}
                  className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  <PhoneCall className="h-3.5 w-3.5" />
                  <span>Start First Voice Call</span>
                </button>
              </div>
            ) : (
              <div className="mt-4">
                <svg
                  ref={trendSvgRef}
                  role="img"
                  aria-label="Fluency score progression chart across recent speaking calls"
                  className="block w-full h-auto"
                />
              </div>
            )}
          </section>

          {/* 7-Day Red & Green Mini Activity Strip */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Last 7 Days Check-In</h2>
                <p className="text-xs text-slate-500">
                  Green marks practiced days · Red marks missed days
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenHeatmap}
                className="inline-flex min-h-[38px] items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
              >
                <span>Open Full Heatmap</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-7 gap-2">
              {last7Days.map((day) => {
                const practiced = day.count > 0;
                const weekdayShort = day.date.toLocaleDateString('en-US', { weekday: 'short' });
                return (
                  <div
                    key={day.dateIso}
                    className={`flex flex-col items-center justify-center rounded-xl border px-2 py-3 text-center ${
                      practiced
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                        : 'border-red-200 bg-red-50 text-red-800'
                    }`}
                  >
                    <span className="text-[11px] font-semibold">{weekdayShort}</span>
                    <span className="font-mono-tabular mt-1 text-sm font-bold">
                      {practiced ? day.count : 0}
                    </span>
                    <span className="mt-0.5 text-[10px] font-medium">
                      {practiced ? 'Practiced' : 'Missed'}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Right 5 Cols: Quick-Launch AI Voice Partners + Recent Calls */}
        <div className="space-y-6 lg:col-span-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900">Jump Into a Voice Call</h2>
                <p className="text-xs text-slate-500">Pick a partner to open the Voice Call page</p>
              </div>
              <button
                type="button"
                onClick={() => onStartVoiceCall(selectedPersonaId)}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
              >
                All {PERSONA_PROFILES.length} partners
              </button>
            </div>

            <div className="mt-4 space-y-2.5">
              {quickPartners.map((partner) => (
                <button
                  key={partner.id}
                  type="button"
                  onClick={() => onStartVoiceCall(partner.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-left transition hover:border-slate-900 hover:bg-white"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <PersonaAvatarVisualizer personaId={partner.id} name={partner.name} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">
                        {partner.name} · <span className="font-medium text-emerald-700">{partner.voiceName}</span>
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {partner.role} · {partner.field}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900">Recent Calls</h2>
              <button
                type="button"
                onClick={onOpenHeatmap}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
              >
                Full log
              </button>
            </div>

            {speakingSessions.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">
                Complete a voice call or AI recap to see recent calls here.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-slate-100">
                {speakingSessions.slice(0, 4).map((session) => (
                  <div key={session.sessionId} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{session.topic}</p>
                      <p className="truncate text-xs text-slate-500">
                        {session.summary || session.createdAtLabel}
                      </p>
                    </div>
                    <span className="font-mono-tabular shrink-0 text-xs font-bold text-emerald-700">
                      {session.score}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
