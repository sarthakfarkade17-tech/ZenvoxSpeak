import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { PersonaAppearance } from '../data/curriculum';
import { computeMouthAperture } from '../utils/learningLogic';

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface PersonaAvatarVisualizerProps {
  personaId: PersonaAppearance;
  name: string;
  role?: string;
  state?: VoiceState;
  audioLevel?: number;
  size?: 'sm' | 'lg';
  caption?: string;
  statusLabel?: string;
}

interface PersonaLook {
  skin: string;
  skinShadow: string;
  hair: string;
  shirt: string;
  collar: string;
  backdrop: string;
  ringColor: string;
  barColor: string;
  glasses?: 'rect' | 'round';
  beard?: boolean;
  headset?: boolean;
  earrings?: boolean;
  hairStyle: 'bob' | 'fade' | 'ponytail' | 'textured' | 'parted' | 'wavy' | 'silverParted' | 'bun';
}

const PERSONA_LOOKS: Record<PersonaAppearance, PersonaLook> = {
  maya: {
    skin: '#E8B89A',
    skinShadow: '#D79E7D',
    hair: '#2B1E1A',
    shirt: '#059669',
    collar: '#ECFDF5',
    backdrop: '#ECFDF5',
    ringColor: 'border-emerald-500/45',
    barColor: 'bg-emerald-600',
    hairStyle: 'bob',
  },
  marcus: {
    skin: '#8D583B',
    skinShadow: '#74452C',
    hair: '#18181B',
    shirt: '#0F172A',
    collar: '#F8FAFC',
    backdrop: '#F1F5F9',
    ringColor: 'border-slate-700/40',
    barColor: 'bg-slate-900',
    glasses: 'rect',
    hairStyle: 'fade',
  },
  chloe: {
    skin: '#F5CDB4',
    skinShadow: '#E3B294',
    hair: '#6B3E26',
    shirt: '#0284C7',
    collar: '#F0F9FF',
    backdrop: '#F0F9FF',
    ringColor: 'border-sky-500/45',
    barColor: 'bg-sky-600',
    hairStyle: 'ponytail',
  },
  liam: {
    skin: '#F2C5A7',
    skinShadow: '#DDA885',
    hair: '#3F2A1D',
    shirt: '#D97706',
    collar: '#1E293B',
    backdrop: '#FFFBEB',
    ringColor: 'border-amber-500/45',
    barColor: 'bg-amber-600',
    headset: true,
    hairStyle: 'textured',
  },
  noah: {
    skin: '#C8926E',
    skinShadow: '#B27A55',
    hair: '#27272A',
    shirt: '#334155',
    collar: '#E2E8F0',
    backdrop: '#F8FAFC',
    ringColor: 'border-slate-500/45',
    barColor: 'bg-slate-700',
    glasses: 'round',
    beard: true,
    hairStyle: 'parted',
  },
  sofia: {
    skin: '#E0AC88',
    skinShadow: '#C78E6A',
    hair: '#241410',
    shirt: '#E11D48',
    collar: '#FFF1F2',
    backdrop: '#FFF1F2',
    ringColor: 'border-rose-500/45',
    barColor: 'bg-rose-600',
    earrings: true,
    hairStyle: 'wavy',
  },
  ethan: {
    skin: '#F0C7AC',
    skinShadow: '#D9A789',
    hair: '#475569',
    shirt: '#0D9488',
    collar: '#F0FDFA',
    backdrop: '#F0FDFA',
    ringColor: 'border-teal-500/45',
    barColor: 'bg-teal-600',
    glasses: 'rect',
    beard: true,
    hairStyle: 'silverParted',
  },
  aria: {
    skin: '#F4CEB8',
    skinShadow: '#DFB094',
    hair: '#1E1B18',
    shirt: '#7C3AED',
    collar: '#F5F3FF',
    backdrop: '#F5F3FF',
    ringColor: 'border-violet-500/45',
    barColor: 'bg-violet-600',
    earrings: true,
    hairStyle: 'bun',
  },
};

const BAR_WEIGHTS = [0.45, 0.78, 1.0, 0.86, 0.62, 0.94, 0.7, 0.48];

export const PersonaAvatarVisualizer: React.FC<PersonaAvatarVisualizerProps> = ({
  personaId,
  name,
  role,
  state = 'idle',
  audioLevel = 0.3,
  size = 'lg',
  caption,
  statusLabel,
}) => {
  const look = PERSONA_LOOKS[personaId] ?? PERSONA_LOOKS.maya;
  const isActive = state !== 'idle';
  const isSpeaking = state === 'speaking';
  const isListening = state === 'listening';
  const isThinking = state === 'thinking';

  const [speechPhase, setSpeechPhase] = useState(0);

  useEffect(() => {
    if (!isSpeaking) return;
    let raf = 0;
    const step = () => {
      setSpeechPhase((p) => (p + 0.28) % (Math.PI * 2));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [isSpeaking]);

  const clampedLevel = Math.max(0.18, Math.min(1, audioLevel));
  const mouthAperture = computeMouthAperture(clampedLevel, isSpeaking, speechPhase);
  const mouthHeight = isSpeaking ? 3 + mouthAperture * 10 : isListening ? 2.5 : 2;
  const mouthWidth = isSpeaking ? 13 + mouthAperture * 5 : 14;

  const dimensions = size === 'sm' ? 'h-12 w-12' : 'h-32 w-32 sm:h-36 sm:w-36';

  if (size === 'sm') {
    return (
      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
        <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden="true">
          <rect width="120" height="120" fill={look.backdrop} />
          <PersonaCharacterSvg
            look={look}
            isSpeaking={false}
            isListening={false}
            isThinking={false}
            mouthHeight={2}
            mouthWidth={14}
          />
        </svg>
      </div>
    );
  }

  return (
    <div
      data-testid="persona-stage"
      data-persona={personaId}
      data-voice-state={state}
      className="flex flex-col items-center text-center"
    >
      {/* Animated Portrait + Acoustic Aura */}
      <div className={`relative flex items-center justify-center ${dimensions}`}>
        {isActive && (
          <>
            <motion.span
              aria-hidden="true"
              className={`absolute -inset-2 rounded-full border-2 ${look.ringColor}`}
              animate={{
                scale: [1, 1.12 + clampedLevel * 0.14, 1],
                opacity: [0.7, 0.15, 0.7],
              }}
              transition={{ duration: isListening ? 1.1 : 1.4, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.span
              aria-hidden="true"
              className={`absolute -inset-4 rounded-full border ${look.ringColor}`}
              animate={{
                scale: [1, 1.18 + clampedLevel * 0.18, 1],
                opacity: [0.45, 0.05, 0.45],
              }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: 0.25 }}
            />
          </>
        )}

        <motion.div
          className="relative h-full w-full overflow-hidden rounded-full border-2 border-white bg-white shadow-md"
          animate={
            isSpeaking
              ? {
                  scale: [1, 1.02 + clampedLevel * 0.025, 1],
                  rotate: [0, 1.4, 0, -1.2, 0],
                  y: [0, -2, 0],
                }
              : isListening
              ? { scale: 1.03, rotate: [0, 1.2, 0], y: [0, -1.5, 0] }
              : isThinking
              ? { rotate: -2.5, y: [0, -2, 0] }
              : { scale: 1, y: [0, -2, 0], rotate: 0 }
          }
          transition={{
            duration: isSpeaking ? 1.2 : 3.2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          <svg viewBox="0 0 120 120" className="h-full w-full" role="img" aria-label={`${name} animated tutor portrait`}>
            <rect width="120" height="120" fill={look.backdrop} />
            <PersonaCharacterSvg
              look={look}
              isSpeaking={isSpeaking}
              isListening={isListening}
              isThinking={isThinking}
              mouthHeight={mouthHeight}
              mouthWidth={mouthWidth}
            />
          </svg>
        </motion.div>
      </div>

      {/* Name, Role & Dynamic Spectrum Strip */}
      <div className="mt-3 flex flex-col items-center gap-1">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <span>{name}</span>
          {role && (
            <>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span className="text-xs font-medium text-slate-600">{role}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex h-4 items-center gap-1" aria-hidden="true" data-testid="voice-visualizer">
            {BAR_WEIGHTS.map((weight, idx) => (
              <motion.span
                key={idx}
                className={`w-1 rounded-full ${isActive ? look.barColor : 'bg-slate-300'}`}
                style={{ height: 14, originY: 0.5 }}
                animate={
                  isActive
                    ? {
                        scaleY: [
                          0.22,
                          Math.min(1, weight * (0.55 + clampedLevel * 0.5)),
                          0.26,
                        ],
                      }
                    : { scaleY: 0.25 }
                }
                transition={{
                  duration: isSpeaking ? 0.42 + (idx % 3) * 0.1 : 0.7 + (idx % 3) * 0.12,
                  repeat: isActive ? Infinity : 0,
                  delay: idx * 0.05,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </div>
          {statusLabel && (
            <span className="text-xs font-medium text-slate-600">{statusLabel}</span>
          )}
        </div>
      </div>

      {/* On-Screen Two-Way Speech Caption */}
      {caption && (
        <motion.div
          key={caption.slice(0, 32)}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="mt-3 max-w-md rounded-2xl border border-slate-200 bg-white/95 px-4 py-2.5 text-xs leading-relaxed text-slate-800 shadow-xs"
        >
          <span className="font-semibold text-emerald-700">{name}: </span>
          <span>"{caption}"</span>
        </motion.div>
      )}
    </div>
  );
};

interface SvgPartsProps {
  look: PersonaLook;
  isSpeaking: boolean;
  isListening: boolean;
  isThinking: boolean;
  mouthHeight: number;
  mouthWidth: number;
}

const PersonaCharacterSvg: React.FC<SvgPartsProps> = ({
  look,
  isSpeaking,
  isListening,
  isThinking,
  mouthHeight,
  mouthWidth,
}) => {
  const browOffsetY = isListening ? -1.8 : isThinking ? -1.2 : isSpeaking ? -1 : 0;
  const eyeOffsetY = isThinking ? -1.4 : 0;

  return (
    <g>
      {/* Back Hair Layer */}
      {look.hairStyle === 'bob' && (
        <path d="M30 48 C28 24, 92 24, 90 48 L92 78 C84 82, 36 82, 28 78 Z" fill={look.hair} />
      )}
      {look.hairStyle === 'wavy' && (
        <path d="M27 50 C25 22, 95 22, 93 50 C95 66, 91 84, 86 90 L34 90 C29 84, 25 66, 27 50 Z" fill={look.hair} />
      )}
      {look.hairStyle === 'ponytail' && (
        <>
          <ellipse cx="86" cy="40" rx="14" ry="18" fill={look.hair} transform="rotate(18 86 40)" />
          <circle cx="60" cy="44" r="28" fill={look.hair} />
        </>
      )}
      {look.hairStyle === 'bun' && (
        <>
          <circle cx="60" cy="20" r="12" fill={look.hair} />
          <circle cx="60" cy="43" r="27" fill={look.hair} />
        </>
      )}

      {/* Shoulders & Outfit */}
      <path d="M18 122 C22 92, 42 86, 60 86 C78 86, 98 92, 102 122 Z" fill={look.shirt} />
      <path d="M47 87 L60 102 L73 87 Z" fill={look.collar} />

      {/* Neck */}
      <rect x="52" y="72" width="16" height="18" rx="7" fill={look.skinShadow} />

      {/* Ears */}
      <circle cx="34" cy="56" r="5.5" fill={look.skinShadow} />
      <circle cx="86" cy="56" r="5.5" fill={look.skinShadow} />

      {/* Earrings */}
      {look.earrings && (
        <g stroke="#F59E0B" strokeWidth="1.8" fill="none">
          <circle cx="34" cy="63" r="3" />
          <circle cx="86" cy="63" r="3" />
        </g>
      )}

      {/* Head */}
      <rect x="35" y="28" width="50" height="52" rx="24" fill={look.skin} />

      {/* Beard / Facial Hair */}
      {look.beard && (
        <path
          d="M36 56 C36 74, 46 81, 60 81 C74 81, 84 74, 84 56 C82 65, 73 72, 60 72 C47 72, 38 65, 36 56 Z"
          fill={look.hair}
          opacity="0.88"
        />
      )}

      {/* Front Hair Layer */}
      {look.hairStyle === 'bob' && (
        <path d="M33 46 C34 25, 86 25, 87 46 C77 35, 52 34, 33 46 Z" fill={look.hair} />
      )}
      {look.hairStyle === 'wavy' && (
        <path d="M33 46 C34 24, 86 24, 87 46 C74 33, 46 37, 33 46 Z" fill={look.hair} />
      )}
      {look.hairStyle === 'fade' && (
        <path d="M35 42 C36 22, 84 22, 85 42 C74 33, 46 33, 35 42 Z" fill={look.hair} />
      )}
      {look.hairStyle === 'ponytail' && (
        <path d="M34 45 C36 24, 84 24, 86 45 C74 34, 52 37, 34 45 Z" fill={look.hair} />
      )}
      {look.hairStyle === 'bun' && (
        <path d="M34 44 C36 24, 84 24, 86 44 C73 34, 47 34, 34 44 Z" fill={look.hair} />
      )}
      {look.hairStyle === 'textured' && (
        <path d="M34 44 C33 22, 54 18, 66 22 C79 20, 88 30, 86 44 C73 34, 47 34, 34 44 Z" fill={look.hair} />
      )}
      {look.hairStyle === 'parted' && (
        <path d="M35 44 C35 23, 85 23, 85 44 C73 32, 54 36, 35 44 Z" fill={look.hair} />
      )}
      {look.hairStyle === 'silverParted' && (
        <>
          <path d="M35 44 C35 23, 85 23, 85 44 C73 32, 54 36, 35 44 Z" fill={look.hair} />
          <path d="M40 35 Q50 28 60 32" stroke="#CBD5E1" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        </>
      )}

      {/* Studio Headset for Tech Partner */}
      {look.headset && (
        <g>
          <path d="M31 53 C30 24, 90 24, 89 53" stroke="#1E293B" strokeWidth="3.2" fill="none" />
          <rect x="28" y="48" width="6.5" height="14" rx="3" fill="#0F172A" />
          <rect x="85.5" y="48" width="6.5" height="14" rx="3" fill="#0F172A" />
          <path d="M32 60 Q40 71 50 70" stroke="#334155" strokeWidth="2" strokeLinecap="round" fill="none" />
        </g>
      )}

      {/* Eyebrows */}
      <g transform={`translate(0 ${browOffsetY})`}>
        <path d="M43 45 Q48 42.5 53 45" stroke={look.hair} strokeWidth="2.2" strokeLinecap="round" fill="none" />
        <path d="M67 45 Q72 42.5 77 45" stroke={look.hair} strokeWidth="2.2" strokeLinecap="round" fill="none" />
      </g>

      {/* Eyes with animated natural blinking */}
      <motion.g
        transform={`translate(0 ${eyeOffsetY})`}
        style={{ transformOrigin: '60px 52px' }}
        animate={{ scaleY: [1, 1, 0.08, 1, 1] }}
        transition={{ duration: 4.2, times: [0, 0.46, 0.49, 0.52, 1], repeat: Infinity }}
      >
        <circle cx="48" cy="52" r="3" fill="#0F172A" />
        <circle cx="72" cy="52" r="3" fill="#0F172A" />
        <circle cx="49" cy="51" r="1" fill="#FFFFFF" />
        <circle cx="73" cy="51" r="1" fill="#FFFFFF" />
      </motion.g>

      {/* Glasses */}
      {look.glasses === 'rect' && (
        <g stroke="#0F172A" strokeWidth="1.8" fill="none">
          <rect x="40" y="47" width="16" height="10" rx="2.5" />
          <rect x="64" y="47" width="16" height="10" rx="2.5" />
          <line x1="56" y1="51.5" x2="64" y2="51.5" />
        </g>
      )}
      {look.glasses === 'round' && (
        <g stroke="#334155" strokeWidth="1.8" fill="none">
          <circle cx="48" cy="52" r="7.5" />
          <circle cx="72" cy="52" r="7.5" />
          <line x1="55.5" y1="52" x2="64.5" y2="52" />
        </g>
      )}

      {/* Nose */}
      <path d="M60 54 L58.5 60.5 L61.5 61" stroke={look.skinShadow} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />

      {/* Expressive Animated Mouth */}
      {isSpeaking ? (
        <g>
          <ellipse
            cx="60"
            cy="67.5"
            rx={mouthWidth / 2}
            ry={mouthHeight / 2}
            fill="#7F1D1D"
          />
          <ellipse
            cx="60"
            cy={67.5 + mouthHeight * 0.22}
            rx={mouthWidth * 0.28}
            ry={Math.max(1, mouthHeight * 0.22)}
            fill="#EF4444"
          />
        </g>
      ) : (
        <path
          d={isThinking ? 'M54 67.5 Q60 67 66 67.5' : 'M53 66 Q60 71.5 67 66'}
          stroke="#7F1D1D"
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
        />
      )}
    </g>
  );
};
