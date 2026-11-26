import React from 'react';
import { CheckCircle2, Sparkles, Volume2, X } from 'lucide-react';
import { LiveCallReviewResult } from '../utils/learningLogic';

interface LiveCallCorrectionsPanelProps {
  partnerName: string;
  isLoading: boolean;
  review: LiveCallReviewResult | null;
  emptyNotice: string | null;
  onSpeakPhrase: (phrase: string) => void;
  onDismiss: () => void;
}

export const LiveCallCorrectionsPanel: React.FC<LiveCallCorrectionsPanelProps> = ({
  partnerName,
  isLoading,
  review,
  emptyNotice,
  onSpeakPhrase,
  onDismiss,
}) => {
  if (!isLoading && !review && !emptyNotice) {
    return null;
  }

  return (
    <section
      aria-label="Live Call Corrections"
      className="border-t border-slate-200 bg-slate-50/75 px-4 py-4 sm:px-5"
    >
      {isLoading ? (
        <div className="flex items-center justify-between gap-3 py-1">
          <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-700">
            <Sparkles className="h-4 w-4 animate-pulse text-emerald-700" />
            <span>Reviewing what you spoke during the live call for English corrections...</span>
          </div>
        </div>
      ) : emptyNotice ? (
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs leading-relaxed text-slate-600">{emptyNotice}</p>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss post-call notice"
            className="inline-flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70 hover:text-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : review ? (
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                <h3 className="font-bold text-slate-900">
                  Live Call Corrections · {partnerName}
                </h3>
                <span className="font-mono-tabular font-semibold text-emerald-700">
                  {review.averageScore}% natural
                </span>
                <span className="text-slate-500">
                  {(() => {
                    const count = review.corrections.filter((c) => c.needsCorrection).length;
                    return `${count} ${count === 1 ? 'improvement' : 'improvements'}`;
                  })()}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{review.overallSummary}</p>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Close live call corrections"
              className="inline-flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70 hover:text-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 max-h-[260px] divide-y divide-slate-200 overflow-y-auto rounded-xl border border-slate-200 bg-white">
            {review.corrections.map((item) => (
              <div key={item.turnId} className="px-4 py-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                    <CheckCircle2
                      className={`h-3.5 w-3.5 ${
                        item.needsCorrection ? 'text-amber-600' : 'text-emerald-600'
                      }`}
                    />
                    {item.toneNote}
                  </span>
                  <span className="font-mono-tabular font-semibold text-slate-500">
                    {item.naturalnessScore}%
                  </span>
                </div>

                <p className="mt-1.5 text-slate-600">
                  <span className="font-semibold text-slate-800">You said:</span> "{item.originalText}"
                </p>

                {item.needsCorrection && item.correctedSentence ? (
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-emerald-900">
                      <span className="font-semibold text-emerald-700">Better phrasing:</span> "
                      {item.correctedSentence}"
                    </p>
                    <button
                      type="button"
                      onClick={() => onSpeakPhrase(item.correctedSentence)}
                      aria-label={`Hear better phrasing: ${item.correctedSentence}`}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                      <span>Hear It</span>
                    </button>
                  </div>
                ) : (
                  <p className="mt-1 font-medium text-emerald-700">
                    Sounded natural as spoken.
                  </p>
                )}

                <p className="mt-1 text-slate-600">{item.feedbackTip}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
};
