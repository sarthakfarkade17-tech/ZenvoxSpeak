import React from 'react';
import { History, PhoneCall } from 'lucide-react';
import { useLearningStore } from '../hooks/useLearningStore';
import { PracticeHeatmap } from './PracticeHeatmap';

interface HeatmapPageViewProps {
  onStartVoiceCall: () => void;
}

export const HeatmapPageView: React.FC<HeatmapPageViewProps> = ({ onStartVoiceCall }) => {
  const { profile, sessions } = useLearningStore();
  const speakingSessions = sessions.filter((s) => !s.mode || s.mode === 'tutor');

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-700">
              Daily Consistency Calendar · Red &amp; Green Activity Map
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Practice Heatmap &amp; Call History
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Green squares track practiced days and active streaks; red squares highlight missed days so you can spot gaps quickly.
            </p>
          </div>

          <button
            type="button"
            onClick={onStartVoiceCall}
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 whitespace-nowrap self-start sm:self-auto"
          >
            <PhoneCall className="h-4 w-4" />
            <span>Start Voice Call</span>
          </button>
        </div>
      </section>

      {/* Full Red & Green D3 Practice Heatmap */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <PracticeHeatmap
          sessions={sessions}
          streakDays={profile.streakDays}
          lastPracticeDate={profile.lastPracticeDate}
          xpTotal={profile.xpTotal}
        />
      </section>

      {/* Complete Speaking Call History */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-emerald-700" />
            <h2 className="text-base font-bold text-slate-900">Speaking Call Log</h2>
          </div>
          <span className="font-mono-tabular text-xs text-slate-500">
            {speakingSessions.length} {speakingSessions.length === 1 ? 'call' : 'calls'} recorded
          </span>
        </div>

        {speakingSessions.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            Start a voice call on the Voice Call page to record your first speaking session.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {speakingSessions.map((session) => (
              <div
                key={session.sessionId}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{session.topic}</p>
                  <p className="truncate text-xs text-slate-500">
                    {session.summary || session.createdAtLabel}
                  </p>
                  <p className="font-mono-tabular mt-1 text-[11px] text-slate-400">
                    {session.practiceDate || session.createdAtLabel}
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
  );
};
