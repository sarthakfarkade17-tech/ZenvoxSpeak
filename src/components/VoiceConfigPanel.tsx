import React from 'react';
import { Clock, Pause, Play, RotateCcw, SlidersHorizontal, Volume2 } from 'lucide-react';
import {
  buildVoiceDeliveryStyle,
  formatCountdownMmSs,
  SESSION_TIMER_OPTIONS,
  SessionTimerMinutes,
  VoiceDeliveryConfig,
  VoicePace,
  VoiceTone,
} from '../utils/learningLogic';

interface VoiceConfigPanelProps {
  partnerName: string;
  baseStyle: string;
  value: VoiceDeliveryConfig;
  onChange: (next: VoiceDeliveryConfig) => void;
  onPreview: () => void;
  sessionTimerMinutes: SessionTimerMinutes;
  onSessionTimerChange: (minutes: SessionTimerMinutes) => void;
  timerRemainingSeconds: number;
  isTimerRunning: boolean;
  isTimerExpired: boolean;
  onToggleTimerPause: () => void;
  onResetTimer: () => void;
  isBusy?: boolean;
}

const TONE_OPTIONS: Array<{ id: VoiceTone; label: string }> = [
  { id: 'friendly', label: 'Friendly' },
  { id: 'formal', label: 'Formal' },
  { id: 'calm', label: 'Calm' },
  { id: 'energetic', label: 'Energetic' },
];

const PACE_OPTIONS: Array<{ id: VoicePace; label: string }> = [
  { id: 'slow', label: 'Slow' },
  { id: 'normal', label: 'Normal' },
  { id: 'fast', label: 'Fast' },
];

export const VoiceConfigPanel: React.FC<VoiceConfigPanelProps> = ({
  partnerName,
  baseStyle,
  value,
  onChange,
  onPreview,
  sessionTimerMinutes,
  onSessionTimerChange,
  timerRemainingSeconds,
  isTimerRunning,
  isTimerExpired,
  onToggleTimerPause,
  onResetTimer,
  isBusy = false,
}) => {
  const { deliveryLabel } = buildVoiceDeliveryStyle(baseStyle, value);
  const timerLabel =
    sessionTimerMinutes > 0
      ? `${sessionTimerMinutes} min limit`
      : 'No timer limit';

  return (
    <section
      aria-label="AI Voice and Session Settings"
      className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-emerald-700" />
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-slate-900">Voice &amp; Session</h3>
            <p className="truncate text-[11px] text-slate-500">
              {partnerName} · {deliveryLabel} · {timerLabel}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onPreview}
          disabled={isBusy}
          className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap"
        >
          <Volume2 className="h-3.5 w-3.5 text-emerald-700" />
          <span>Test Delivery</span>
        </button>
      </div>

      <div className="mt-3.5 space-y-3">
        {/* Voice Tone Selector */}
        <div>
          <p className="mb-1.5 text-[11px] font-semibold text-slate-600">Tone</p>
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Voice tone">
            {TONE_OPTIONS.map((opt) => {
              const active = value.tone === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange({ ...value, tone: opt.id })}
                  className={`min-h-[36px] rounded-lg px-2 text-xs font-semibold transition whitespace-nowrap ${
                    active
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Speaking Speed Selector */}
        <div>
          <p className="mb-1.5 text-[11px] font-semibold text-slate-600">Speed</p>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Speaking speed">
            {PACE_OPTIONS.map((opt) => {
              const active = value.pace === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange({ ...value, pace: opt.id })}
                  className={`min-h-[36px] rounded-lg px-2 text-xs font-semibold transition whitespace-nowrap ${
                    active
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Optional Session Timer Limit */}
        <div className="border-t border-slate-100 pt-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
              <Clock className="h-3.5 w-3.5 text-emerald-700" />
              <span>Session Timer (Optional)</span>
            </span>
            {sessionTimerMinutes > 0 && (
              <span
                className={`font-mono-tabular text-xs font-bold ${
                  isTimerExpired
                    ? 'text-red-700'
                    : timerRemainingSeconds <= 60
                      ? 'text-amber-700'
                      : 'text-emerald-700'
                }`}
              >
                {isTimerExpired ? 'Time up · 00:00' : formatCountdownMmSs(timerRemainingSeconds)}
              </span>
            )}
          </div>

          <div
            className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1"
            role="group"
            aria-label="Session timer limit"
          >
            {SESSION_TIMER_OPTIONS.map((minutes) => {
              const active = sessionTimerMinutes === minutes;
              return (
                <button
                  key={minutes}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSessionTimerChange(minutes)}
                  className={`min-h-[36px] rounded-lg px-2 text-xs font-semibold transition whitespace-nowrap ${
                    active
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {minutes === 0 ? 'No Limit' : `${minutes} min`}
                </button>
              );
            })}
          </div>

          {sessionTimerMinutes > 0 && (
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500">
              <span>
                {isTimerExpired
                  ? 'Session limit reached'
                  : isTimerRunning
                    ? 'Counting down'
                    : 'Paused'}
              </span>
              <div className="flex items-center gap-3">
                {!isTimerExpired && (
                  <button
                    type="button"
                    onClick={onToggleTimerPause}
                    className="inline-flex min-h-[28px] items-center gap-1 font-semibold text-slate-700 hover:text-slate-900"
                  >
                    {isTimerRunning ? (
                      <>
                        <Pause className="h-3 w-3" />
                        <span>Pause</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3 w-3" />
                        <span>Resume</span>
                      </>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onResetTimer}
                  className="inline-flex min-h-[28px] items-center gap-1 font-semibold text-slate-700 hover:text-slate-900"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

