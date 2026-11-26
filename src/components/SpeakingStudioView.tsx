import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CheckCircle2,
  ClipboardList,
  Clock,
  Compass,
  LayoutGrid,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Send,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  Wand2,
} from 'lucide-react';
import {
  ConversationScenario,
  ConversationTheme,
  INFINITE_TOPIC_DOMAINS,
  PARTNER_FIELDS,
  PartnerField,
  PERSONA_PROFILES,
  PersonaAppearance,
  PersonaProfile,
} from '../data/curriculum';
import { useLearningStore } from '../hooks/useLearningStore';
import {
  blobToBase64,
  decodePcm24kToFloat32,
  float32ToPcm16Base64,
  speakStandardEnglish,
  stopActiveAudio,
} from '../utils/audioPlayer';
import {
  buildThemeSeedRequest,
  buildVoiceDeliveryStyle,
  CefrLevel,
  clampString,
  collectLiveCallUserTurns,
  filterPartnersByField,
  formatCountdownMmSs,
  LiveCallReviewResult,
  mergeLiveCallCorrections,
  parseSessionTimerMinutes,
  parseVoiceDeliveryConfig,
  sanitizeConversationTopic,
  SessionTimerMinutes,
  VoiceDeliveryConfig,
} from '../utils/learningLogic';
import { LiveCallCorrectionsPanel } from './LiveCallCorrectionsPanel';
import { PersonaAvatarVisualizer, VoiceState } from './PersonaAvatarVisualizer';
import { ThemeSelectorModal } from './ThemeSelectorModal';
import { VoiceConfigPanel } from './VoiceConfigPanel';

interface TutorTurn {
  id: string;
  role: 'user' | 'tutor';
  text: string;
  correctedSentence?: string;
  feedbackTip?: string;
  toneNote?: string;
  naturalnessScore?: number;
}

interface ReplySuggestion {
  tone: string;
  phrase: string;
  tip: string;
}

interface PolishResult {
  casual: string;
  polite: string;
  reason: string;
}

interface RecapResult {
  strength: string;
  phrasesToKeep: string[];
  nextStep: string;
}

const CEFR_LEVELS: CefrLevel[] = ['A2', 'B1', 'B2', 'C1'];
const VOICE_CONFIG_STORAGE_KEY = 'fluently_voice_delivery_v1';
const SESSION_TIMER_STORAGE_KEY = 'fluently_session_timer_v1';

function downsampleFloat32(input: Float32Array, inputRate: number, targetRate = 16000): Float32Array {
  if (!inputRate || inputRate === targetRate || inputRate < targetRate) {
    return input;
  }
  const ratio = inputRate / targetRate;
  const newLength = Math.max(1, Math.round(input.length / ratio));
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const idx = i * ratio;
    const low = Math.floor(idx);
    const high = Math.min(input.length - 1, low + 1);
    const frac = idx - low;
    result[i] = input[low] * (1 - frac) + input[high] * frac;
  }
  return result;
}

function scenarioFromPersona(persona: PersonaProfile, level: CefrLevel): ConversationScenario {
  return {
    id: `persona_${persona.id}`,
    title: persona.defaultTopicTitle,
    subtitle: persona.specialty,
    level,
    starterPrompt: persona.defaultStarter,
    keyPhrases: persona.keyPhrases,
    communicationGoal: `${persona.field} · ${persona.vibe}`,
  };
}

interface SpeakingStudioViewProps {
  initialPersonaId?: PersonaAppearance;
  onPersonaChange?: (id: PersonaAppearance) => void;
}

export const SpeakingStudioView: React.FC<SpeakingStudioViewProps> = ({
  initialPersonaId,
  onPersonaChange,
}) => {
  const { profile, updatePreferences, recordPracticeSession } = useLearningStore();

  const [selectedField, setSelectedField] = useState<PartnerField>('All Fields');
  const [persona, setPersona] = useState<PersonaProfile>(
    () => PERSONA_PROFILES.find((p) => p.id === initialPersonaId) ?? PERSONA_PROFILES[0]
  );
  const [scenario, setScenario] = useState<ConversationScenario>(() => {
    const startPersona =
      PERSONA_PROFILES.find((p) => p.id === initialPersonaId) ?? PERSONA_PROFILES[0];
    return scenarioFromPersona(startPersona, profile.level);
  });
  const [turns, setTurns] = useState<TutorTurn[]>(() => {
    const startPersona =
      PERSONA_PROFILES.find((p) => p.id === initialPersonaId) ?? PERSONA_PROFILES[0];
    return [
      {
        id: 'initial_partner_turn',
        role: 'tutor',
        text: startPersona.defaultStarter,
      },
    ];
  });

  const [customTopicInput, setCustomTopicInput] = useState('');
  const [selectedDomain, setSelectedDomain] = useState(INFINITE_TOPIC_DOMAINS[0]);
  const [isGeneratingTopic, setIsGeneratingTopic] = useState(false);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [activeTheme, setActiveTheme] = useState<ConversationTheme | null>(null);

  const [inputText, setInputText] = useState('');
  const [autoSpeakReplies, setAutoSpeakReplies] = useState(true);
  const [voiceConfig, setVoiceConfig] = useState<VoiceDeliveryConfig>(() => {
    if (typeof window === 'undefined') return { tone: 'friendly', pace: 'normal' };
    try {
      return parseVoiceDeliveryConfig(window.localStorage.getItem(VOICE_CONFIG_STORAGE_KEY));
    } catch {
      return { tone: 'friendly', pace: 'normal' };
    }
  });
  const [sessionTimerMinutes, setSessionTimerMinutes] = useState<SessionTimerMinutes>(() => {
    if (typeof window === 'undefined') return 0;
    try {
      return parseSessionTimerMinutes(window.localStorage.getItem(SESSION_TIMER_STORAGE_KEY));
    } catch {
      return 0;
    }
  });
  const [timerRemainingSeconds, setTimerRemainingSeconds] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    try {
      return parseSessionTimerMinutes(window.localStorage.getItem(SESSION_TIMER_STORAGE_KEY)) * 60;
    } catch {
      return 0;
    }
  });
  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const [isTimerExpired, setIsTimerExpired] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isRecordingTurn, setIsRecordingTurn] = useState(false);
  const [isSpeakingReply, setIsSpeakingReply] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0.24);

  const [suggestions, setSuggestions] = useState<ReplySuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  const [polishData, setPolishData] = useState<PolishResult | null>(null);
  const [isPolishing, setIsPolishing] = useState(false);

  const [recapData, setRecapData] = useState<RecapResult | null>(null);
  const [isLoadingRecap, setIsLoadingRecap] = useState(false);

  // Live Gemini 3.8 Voice Call state
  const [liveStatus, setLiveStatus] = useState<'idle' | 'connecting' | 'live'>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [liveUserPartial, setLiveUserPartial] = useState('');
  const [liveTutorPartial, setLiveTutorPartial] = useState('');
  const [liveCallReview, setLiveCallReview] = useState<LiveCallReviewResult | null>(null);
  const [isReviewingLiveCall, setIsReviewingLiveCall] = useState(false);
  const [liveCallEmptyNotice, setLiveCallEmptyNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isMutedRef = useRef(false);
  const turnsRef = useRef<TutorTurn[]>(turns);
  turnsRef.current = turns;
  const liveCallStartIdxRef = useRef(0);
  const latestLiveInputRef = useRef('');
  const latestLiveOutputRef = useRef('');
  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const turnRecorderRef = useRef<MediaRecorder | null>(null);
  const turnChunksRef = useRef<BlobPart[]>([]);
  const turnStreamRef = useRef<MediaStream | null>(null);
  const analyserRafRef = useRef<number | null>(null);
  const analyserCtxRef = useRef<AudioContext | null>(null);
  const feedContainerRef = useRef<HTMLDivElement | null>(null);

  const visiblePartners = filterPartnersByField(PERSONA_PROFILES, selectedField);

  useEffect(() => {
    const el = feedContainerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [turns, liveUserPartial, liveTutorPartial, isSending]);

  const stopMeter = () => {
    if (analyserRafRef.current !== null) {
      cancelAnimationFrame(analyserRafRef.current);
      analyserRafRef.current = null;
    }
    try {
      analyserCtxRef.current?.close();
    } catch {
      // ignore
    }
    analyserCtxRef.current = null;
    setAudioLevel(0.24);
  };

  const startMicMeter = (stream: MediaStream) => {
    stopMeter();
    try {
      const ctx = new AudioContext();
      analyserCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length / 255;
        setAudioLevel(Math.min(1, Math.max(0.2, avg * 2.8)));
        analyserRafRef.current = requestAnimationFrame(tick);
      };
      analyserRafRef.current = requestAnimationFrame(tick);
    } catch {
      // ignore if analyser unsupported
    }
  };

  const cleanupLiveCall = () => {
    stopMeter();
    try {
      processorRef.current?.disconnect();
    } catch {
      // ignore
    }
    processorRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try {
      inputCtxRef.current?.close();
    } catch {
      // ignore
    }
    inputCtxRef.current = null;

    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch {
        // ignore
      }
    });
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    try {
      outputCtxRef.current?.close();
    } catch {
      // ignore
    }
    outputCtxRef.current = null;

    if (wsRef.current) {
      const activeWs = wsRef.current;
      wsRef.current = null;
      activeWs.onopen = null;
      activeWs.onmessage = null;
      activeWs.onerror = null;
      activeWs.onclose = null;
      try {
        if (
          activeWs.readyState === WebSocket.OPEN ||
          activeWs.readyState === WebSocket.CONNECTING
        ) {
          activeWs.close();
        }
      } catch {
        // ignore close errors
      }
    }
    latestLiveInputRef.current = '';
    latestLiveOutputRef.current = '';
    setLiveStatus('idle');
    setLiveUserPartial('');
    setLiveTutorPartial('');
    setIsSpeakingReply(false);
  };

  useEffect(() => {
    return () => {
      cleanupLiveCall();
      stopActiveAudio();
      turnStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const playPartnerAudio = async (
    text: string,
    personaOverride?: PersonaProfile,
    configOverride?: VoiceDeliveryConfig
  ) => {
    const activePersona = personaOverride ?? persona;
    const activeConfig = configOverride ?? voiceConfig;
    const { styleInstruction, playbackRate } = buildVoiceDeliveryStyle(
      activePersona.voiceStyle,
      activeConfig
    );
    await speakStandardEnglish(text, {
      voiceName: activePersona.voiceName,
      personaStyle: styleInstruction,
      playbackRate,
      onStart: () => setIsSpeakingReply(true),
      onLevel: (lvl) => setAudioLevel(lvl),
      onEnd: () => {
        setIsSpeakingReply(false);
        setAudioLevel(0.24);
      },
    });
  };

  const handleVoiceConfigChange = (next: VoiceDeliveryConfig) => {
    setVoiceConfig(next);
    try {
      window.localStorage.setItem(VOICE_CONFIG_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore localStorage failures
    }
    if (liveStatus === 'live' && wsRef.current?.readyState === WebSocket.OPEN) {
      const { deliveryLabel } = buildVoiceDeliveryStyle(persona.voiceStyle, next);
      wsRef.current.send(
        JSON.stringify({
          text: `[Delivery preference updated: please respond using a ${deliveryLabel.toLowerCase()}.]`,
        })
      );
    }
  };

  const handlePreviewVoiceDelivery = () => {
    const sampleLine = `Hi, I'm ${persona.name}. Let's practice "${scenario.title}" together at your pace.`;
    void playPartnerAudio(sampleLine);
  };

  const handleSessionTimerChange = (minutes: SessionTimerMinutes) => {
    setSessionTimerMinutes(minutes);
    setTimerRemainingSeconds(minutes * 60);
    setIsTimerPaused(false);
    setIsTimerExpired(false);
    try {
      window.localStorage.setItem(SESSION_TIMER_STORAGE_KEY, String(minutes));
    } catch {
      // ignore localStorage failures
    }
  };

  const handleToggleTimerPause = () => {
    if (sessionTimerMinutes === 0 || isTimerExpired) return;
    setIsTimerPaused((prev) => !prev);
  };

  const handleResetTimer = () => {
    if (sessionTimerMinutes === 0) return;
    setTimerRemainingSeconds(sessionTimerMinutes * 60);
    setIsTimerPaused(false);
    setIsTimerExpired(false);
  };

  const handleExtendTimer = (extraMinutes = 5) => {
    setTimerRemainingSeconds(extraMinutes * 60);
    setIsTimerPaused(false);
    setIsTimerExpired(false);
  };

  const handleSelectPersona = (nextPersona: PersonaProfile) => {
    if (liveStatus !== 'idle') {
      cleanupLiveCall();
    }
    stopActiveAudio();
    setIsSpeakingReply(false);
    setPersona(nextPersona);
    onPersonaChange?.(nextPersona.id);
    if (sessionTimerMinutes > 0 && isTimerExpired) {
      setTimerRemainingSeconds(sessionTimerMinutes * 60);
      setIsTimerExpired(false);
      setIsTimerPaused(false);
    }
    setActiveTheme(null);
    setSuggestions([]);
    setPolishData(null);
    setRecapData(null);
    setLiveCallReview(null);
    setLiveCallEmptyNotice(null);
    setErrorMsg(null);

    const nextScenario = scenarioFromPersona(nextPersona, profile.level);
    setScenario(nextScenario);
    setTurns([
      {
        id: `starter_${nextPersona.id}_${Date.now()}`,
        role: 'tutor',
        text: nextPersona.defaultStarter,
      },
    ]);

    if (autoSpeakReplies) {
      void playPartnerAudio(nextPersona.defaultStarter, nextPersona);
    }
  };

  const launchInfiniteTopic = async (topicHint?: string, domainOverride?: string) => {
    if (liveStatus !== 'idle') {
      cleanupLiveCall();
    }
    stopActiveAudio();
    setIsGeneratingTopic(true);
    setActiveTheme(null);
    setErrorMsg(null);
    setSuggestions([]);
    setPolishData(null);
    setRecapData(null);
    setLiveCallReview(null);
    setLiveCallEmptyNotice(null);

    const safeHint = topicHint ? sanitizeConversationTopic(topicHint, '') : '';
    const domain = domainOverride ?? persona.field;

    try {
      const response = await fetch('/api/tutor/topic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicHint: safeHint,
          domain,
          level: profile.level,
          personaName: persona.name,
          personaRole: persona.role,
          personaField: persona.field,
          personaSpecialty: persona.specialty,
          voiceTone: voiceConfig.tone,
          voicePace: voiceConfig.pace,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Could not start topic.');
      }

      const generated = data.scenario as ConversationScenario;
      setScenario(generated);
      setCustomTopicInput('');
      setTurns([
        {
          id: `inf_starter_${Date.now()}`,
          role: 'tutor',
          text: generated.starterPrompt,
        },
      ]);

      if (autoSpeakReplies) {
        void playPartnerAudio(generated.starterPrompt);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to generate conversation topic.');
    } finally {
      setIsGeneratingTopic(false);
    }
  };

  const seedConversationFromTheme = async ({
    theme,
    customAngle,
    useRecommendedPartner,
  }: {
    theme: ConversationTheme;
    customAngle: string;
    useRecommendedPartner: boolean;
  }) => {
    if (liveStatus !== 'idle') {
      cleanupLiveCall();
    }
    stopActiveAudio();
    setIsSpeakingReply(false);
    setIsGeneratingTopic(true);
    setErrorMsg(null);
    setSuggestions([]);
    setPolishData(null);
    setRecapData(null);
    setLiveCallReview(null);
    setLiveCallEmptyNotice(null);

    const recommended = PERSONA_PROFILES.find((p) => p.id === theme.recommendedPartnerId);
    const targetPersona = useRecommendedPartner && recommended ? recommended : persona;
    if (targetPersona.id !== persona.id) {
      setPersona(targetPersona);
    }

    const seedPayload = buildThemeSeedRequest({
      themeTitle: theme.title,
      themeCategory: theme.category,
      starterSeedContext: theme.starterSeedContext,
      customAngle,
    });

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 7000);

    try {
      const response = await fetch('/api/tutor/topic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          ...seedPayload,
          level: profile.level,
          personaName: targetPersona.name,
          personaRole: targetPersona.role,
          personaField: targetPersona.field,
          personaSpecialty: targetPersona.specialty,
          voiceTone: voiceConfig.tone,
          voicePace: voiceConfig.pace,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Could not seed conversation theme.');
      }

      const generated = data.scenario as ConversationScenario;
      setScenario(generated);
      setActiveTheme(theme);
      setCustomTopicInput('');
      setTurns([
        {
          id: `theme_${theme.id}_${Date.now()}`,
          role: 'tutor',
          text: generated.starterPrompt,
        },
      ]);
      setIsThemeModalOpen(false);

      if (autoSpeakReplies) {
        void playPartnerAudio(generated.starterPrompt, targetPersona);
      }
    } catch {
      const fallbackScenario: ConversationScenario = {
        id: `theme_${theme.id}_${Date.now()}`,
        title: customAngle ? `${theme.title}: ${customAngle}` : theme.title,
        subtitle: theme.tagline,
        level: profile.level,
        starterPrompt: theme.fallbackStarter,
        keyPhrases: theme.keyPhrases,
        communicationGoal: `${theme.title} · ${targetPersona.field}`,
      };
      setScenario(fallbackScenario);
      setActiveTheme(theme);
      setCustomTopicInput('');
      setTurns([
        {
          id: `theme_fb_${theme.id}_${Date.now()}`,
          role: 'tutor',
          text: fallbackScenario.starterPrompt,
        },
      ]);
      setIsThemeModalOpen(false);
      if (autoSpeakReplies) {
        void playPartnerAudio(fallbackScenario.starterPrompt, targetPersona);
      }
    } finally {
      window.clearTimeout(timeoutId);
      setIsGeneratingTopic(false);
    }
  };

  const handleCustomTopicSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTopicInput.trim() || isGeneratingTopic) return;
    await launchInfiniteTopic(customTopicInput.trim());
  };

  const playPcm24kChunk = (base64: string) => {
    const ctx = outputCtxRef.current;
    if (!ctx) return;
    const float32 = decodePcm24kToFloat32(base64);
    if (float32.length === 0) return;

    let sumSq = 0;
    for (let i = 0; i < float32.length; i++) {
      sumSq += float32[i] * float32[i];
    }
    const rms = Math.sqrt(sumSq / float32.length);
    setAudioLevel(Math.min(1, Math.max(0.28, rms * 4.5)));

    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startAt = Math.max(now, nextStartTimeRef.current);
    source.start(startAt);
    nextStartTimeRef.current = startAt + buffer.duration;

    activeSourcesRef.current.add(source);
    setIsSpeakingReply(true);
    source.onended = () => {
      activeSourcesRef.current.delete(source);
      if (activeSourcesRef.current.size === 0) {
        setIsSpeakingReply(false);
        setAudioLevel(0.24);
      }
    };
  };

  const startLiveVoiceCall = async () => {
    if (isTimerExpired) return;
    cleanupLiveCall();
    setErrorMsg(null);
    setLiveCallReview(null);
    setLiveCallEmptyNotice(null);
    liveCallStartIdxRef.current = turnsRef.current.length;
    stopActiveAudio();
    setLiveStatus('connecting');

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone streaming is not supported in this browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      let inputCtx: AudioContext;
      try {
        inputCtx = new AudioContext({ sampleRate: 16000 });
      } catch {
        inputCtx = new AudioContext();
      }
      let outputCtx: AudioContext;
      try {
        outputCtx = new AudioContext({ sampleRate: 24000 });
      } catch {
        outputCtx = new AudioContext();
      }
      if (inputCtx.state === 'suspended') {
        await inputCtx.resume();
      }
      if (outputCtx.state === 'suspended') {
        await outputCtx.resume();
      }
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const qs = new URLSearchParams({
        scenario: scenario.title,
        level: profile.level,
        voice: persona.voiceName,
        personaName: persona.name,
        personaRole: `${persona.role} (${persona.field})`,
        personaVibe: persona.vibe,
        voiceTone: voiceConfig.tone,
        voicePace: voiceConfig.pace,
      });
      const ws = new WebSocket(`${protocol}//${window.location.host}/live?${qs.toString()}`);
      wsRef.current = ws;

      let latestInput = '';
      let latestOutput = '';
      let hadReady = false;
      let hadServerError = false;

      ws.onmessage = (event) => {
        let msg: Record<string, any>;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg.type === 'ready') {
          hadReady = true;
          setLiveStatus('live');
          const source = inputCtx.createMediaStreamSource(stream);
          const processor = inputCtx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;

          processor.onaudioprocess = (ev) => {
            if (isMutedRef.current || ws.readyState !== WebSocket.OPEN) return;
            const rawChannel = ev.inputBuffer.getChannelData(0);
            const channel = downsampleFloat32(rawChannel, inputCtx.sampleRate, 16000);
            let sumSq = 0;
            for (let i = 0; i < channel.length; i++) sumSq += channel[i] * channel[i];
            const rms = Math.sqrt(sumSq / channel.length);
            setAudioLevel(Math.min(1, Math.max(0.2, rms * 5.2)));
            const base64 = float32ToPcm16Base64(channel);
            ws.send(JSON.stringify({ audio: base64 }));
          };

          source.connect(processor);
          processor.connect(inputCtx.destination);

          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                text: `Greet the learner warmly in character as ${persona.name} (${persona.role} in ${persona.field}) on the topic "${scenario.title}" with one brief opening question.`,
              })
            );
          }
        } else if (msg.type === 'inputTranscript' && msg.text) {
          latestInput += msg.text;
          latestLiveInputRef.current = latestInput;
          setLiveUserPartial(latestInput);
        } else if (msg.type === 'outputTranscript' && msg.text) {
          latestOutput += msg.text;
          latestLiveOutputRef.current = latestOutput;
          setLiveTutorPartial(latestOutput);
        } else if (msg.type === 'audio' && msg.audio) {
          playPcm24kChunk(msg.audio);
        } else if (msg.type === 'interrupted') {
          activeSourcesRef.current.forEach((s) => {
            try {
              s.stop();
            } catch {
              // ignore
            }
          });
          activeSourcesRef.current.clear();
          nextStartTimeRef.current = 0;
          setIsSpeakingReply(false);
        } else if (msg.type === 'turnComplete') {
          const committed: TutorTurn[] = [];
          if (latestInput.trim()) {
            committed.push({
              id: `live_u_${Date.now()}`,
              role: 'user',
              text: latestInput.trim(),
            });
          }
          if (latestOutput.trim()) {
            committed.push({
              id: `live_t_${Date.now() + 1}`,
              role: 'tutor',
              text: latestOutput.trim(),
            });
          }
          if (committed.length > 0) {
            turnsRef.current = [...turnsRef.current, ...committed];
            setTurns((prev) => [...prev, ...committed]);
          }
          latestInput = '';
          latestOutput = '';
          latestLiveInputRef.current = '';
          latestLiveOutputRef.current = '';
          setLiveUserPartial('');
          setLiveTutorPartial('');
        } else if (msg.type === 'error') {
          hadServerError = true;
          setErrorMsg(msg.message || 'Live voice session error.');
          cleanupLiveCall();
        }
      };

      ws.onerror = () => {
        if (!hadServerError) {
          setErrorMsg(
            hadReady
              ? 'Live voice connection was interrupted. Please call again.'
              : 'Could not establish live voice connection. Please try again.'
          );
        }
        cleanupLiveCall();
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          if (!hadReady && !hadServerError) {
            setErrorMsg('Live voice session closed before connecting. Please try again.');
          }
          cleanupLiveCall();
        }
      };
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Microphone access is required for a live voice call.'
      );
      cleanupLiveCall();
    }
  };

  const endLiveVoiceCall = async () => {
    const pendingUserText = latestLiveInputRef.current.trim();
    const pendingTutorText = latestLiveOutputRef.current.trim();
    const startIndex = liveCallStartIdxRef.current;
    const baseSnapshot = [...turnsRef.current];

    const flushedTurns: TutorTurn[] = [];
    if (pendingUserText) {
      flushedTurns.push({
        id: `live_u_tail_${Date.now()}`,
        role: 'user',
        text: pendingUserText,
      });
    }
    if (pendingTutorText) {
      flushedTurns.push({
        id: `live_t_tail_${Date.now() + 1}`,
        role: 'tutor',
        text: pendingTutorText,
      });
    }

    if (flushedTurns.length > 0) {
      turnsRef.current = [...baseSnapshot, ...flushedTurns];
      setTurns((prev) => [...prev, ...flushedTurns]);
    }

    const mergedSnapshot = [...baseSnapshot, ...flushedTurns];
    const liveUserUtterances = collectLiveCallUserTurns(mergedSnapshot, startIndex);

    cleanupLiveCall();

    if (liveUserUtterances.length === 0) {
      setLiveCallReview(null);
      setLiveCallEmptyNotice(
        'Live call ended before any spoken sentence was captured. Speak a reply during your next call to get post-call English corrections.'
      );
      return;
    }

    setIsReviewingLiveCall(true);
    setLiveCallEmptyNotice(null);

    try {
      const response = await fetch('/api/tutor/live-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: scenario.title,
          level: profile.level,
          personaName: persona.name,
          utterances: liveUserUtterances,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Could not review live call corrections.');
      }

      const reviewResult: LiveCallReviewResult = {
        overallSummary: data.overallSummary,
        averageScore: data.averageScore,
        corrections: Array.isArray(data.corrections) ? data.corrections : [],
      };

      setLiveCallReview(reviewResult);
      setTurns((prev) => {
        const next = mergeLiveCallCorrections(prev, reviewResult.corrections);
        turnsRef.current = next;
        return next;
      });

      await recordPracticeSession({
        mode: 'tutor',
        topic: clampString(`${persona.name} · ${scenario.title}`, 120, 'Speaking Call'),
        score: reviewResult.averageScore || Math.min(98, 82 + liveUserUtterances.length * 3),
        summary: clampString(
          reviewResult.overallSummary ||
            `Live voice call with ${persona.name} (${persona.field}) on ${scenario.title}.`,
          600
        ),
      });
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to generate post-call corrections.'
      );
      await recordPracticeSession({
        mode: 'tutor',
        topic: clampString(`${persona.name} · ${scenario.title}`, 120, 'Speaking Call'),
        score: Math.min(98, 82 + liveUserUtterances.length * 3),
        summary: clampString(
          `Live voice call with ${persona.name} (${persona.field}) on ${scenario.title}.`,
          600
        ),
      });
    } finally {
      setIsReviewingLiveCall(false);
    }
  };

  const toggleMute = () => {
    const next = !isMuted;
    isMutedRef.current = next;
    setIsMuted(next);
  };

  useEffect(() => {
    if (sessionTimerMinutes === 0 || isTimerPaused || isTimerExpired) return;
    const intervalId = window.setInterval(() => {
      setTimerRemainingSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [isTimerExpired, isTimerPaused, sessionTimerMinutes]);

  useEffect(() => {
    if (sessionTimerMinutes === 0 || isTimerExpired || timerRemainingSeconds > 0) return;
    setIsTimerExpired(true);
    stopActiveAudio();
    setIsSpeakingReply(false);
    if (liveStatus !== 'idle') {
      void endLiveVoiceCall();
    }
  }, [isTimerExpired, liveStatus, sessionTimerMinutes, timerRemainingSeconds]);

  const submitTurn = async (payload: { userText?: string; audioBase64?: string; audioMimeType?: string }) => {
    if (isTimerExpired) return;
    setIsSending(true);
    setErrorMsg(null);
    setSuggestions([]);
    setPolishData(null);

    try {
      const response = await fetch('/api/tutor/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: scenario.title,
          level: profile.level,
          personaName: persona.name,
          personaRole: `${persona.role} (${persona.field})`,
          personaVibe: persona.vibe,
          voiceTone: voiceConfig.tone,
          voicePace: voiceConfig.pace,
          history: turns.slice(-8).map((t) => ({ role: t.role, text: t.text })),
          ...payload,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Could not reach AI conversation partner.');
      }

      const userTurn: TutorTurn = {
        id: `u_${Date.now()}`,
        role: 'user',
        text: data.transcript,
        correctedSentence: data.correctedSentence,
        feedbackTip: data.feedbackTip,
        toneNote: data.toneNote,
        naturalnessScore: data.naturalnessScore,
      };
      const tutorTurn: TutorTurn = {
        id: `t_${Date.now() + 1}`,
        role: 'tutor',
        text: data.reply,
      };

      setTurns((prev) => [...prev, userTurn, tutorTurn]);
      setInputText('');

      // Two-way communication: reply on screen AND in spoken audio automatically
      if (autoSpeakReplies || payload.audioBase64) {
        void playPartnerAudio(data.reply);
      }

      await recordPracticeSession({
        mode: 'tutor',
        topic: clampString(`${persona.name} · ${scenario.title}`, 120, 'Speaking Practice'),
        score: data.naturalnessScore ?? 88,
        summary: clampString(`${persona.name} (${persona.field}) · ${scenario.title}: ${data.feedbackTip ?? 'Healthy two-way speaking exchange.'}`, 600),
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to send message.');
    } finally {
      setIsSending(false);
    }
  };

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isSending || isTimerExpired) return;
    await submitTurn({ userText: inputText.trim() });
  };

  const handleSuggestReplies = async () => {
    setIsLoadingSuggestions(true);
    setPolishData(null);
    setErrorMsg(null);
    const lastTutor = [...turns].reverse().find((t) => t.role === 'tutor')?.text ?? scenario.starterPrompt;
    try {
      const response = await fetch('/api/tutor/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: scenario.title,
          level: profile.level,
          lastTutorMessage: lastTutor,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Could not suggest replies.');
      }
      if (Array.isArray(data.suggestions)) {
        setSuggestions(data.suggestions.slice(0, 3));
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load reply ideas.');
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handlePolishDraft = async () => {
    if (!inputText.trim() || isPolishing) return;
    setIsPolishing(true);
    setSuggestions([]);
    setErrorMsg(null);
    try {
      const response = await fetch('/api/tutor/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft: inputText.trim(),
          scenario: scenario.title,
          level: profile.level,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Could not polish phrasing.');
      }
      setPolishData(data as PolishResult);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to polish draft.');
    } finally {
      setIsPolishing(false);
    }
  };

  const handleRecapConversation = async () => {
    setIsLoadingRecap(true);
    setErrorMsg(null);
    try {
      const response = await fetch('/api/tutor/recap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: scenario.title,
          level: profile.level,
          history: turns.slice(-12).map((t) => ({ role: t.role, text: t.text })),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Could not generate recap.');
      }
      setRecapData(data as RecapResult);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to create session recap.');
    } finally {
      setIsLoadingRecap(false);
    }
  };

  const startVoiceTurn = async () => {
    setErrorMsg(null);
    stopActiveAudio();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      turnStreamRef.current = stream;
      startMicMeter(stream);
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      turnChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) turnChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stopMeter();
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(turnChunksRef.current, { type: mimeType });
        const base64 = await blobToBase64(blob);
        await submitTurn({ audioBase64: base64, audioMimeType: mimeType });
      };
      turnRecorderRef.current = recorder;
      recorder.start();
      setIsRecordingTurn(true);
    } catch (err) {
      stopMeter();
      setErrorMsg(err instanceof Error ? err.message : 'Microphone permission required for speaking.');
    }
  };

  const stopVoiceTurn = () => {
    stopMeter();
    if (turnRecorderRef.current && turnRecorderRef.current.state !== 'inactive') {
      turnRecorderRef.current.stop();
    }
    setIsRecordingTurn(false);
  };

  const voiceState: VoiceState =
    liveStatus === 'live' && !isMuted && !isSpeakingReply && !liveTutorPartial
      ? 'listening'
      : isRecordingTurn
      ? 'listening'
      : liveStatus === 'connecting' || isSending || isGeneratingTopic
      ? 'thinking'
      : isSpeakingReply || Boolean(liveTutorPartial)
      ? 'speaking'
      : 'idle';

  const voiceStatusLabel =
    voiceState === 'listening'
      ? `${persona.name} is listening to you`
      : voiceState === 'thinking'
      ? `${persona.name} is thinking...`
      : voiceState === 'speaking'
      ? `${persona.name} is speaking`
      : liveStatus === 'live'
      ? 'Live voice call connected'
      : `Ready · ${persona.voiceToneLabel}`;

  const latestTutorMessage =
    liveTutorPartial || [...turns].reverse().find((t) => t.role === 'tutor')?.text || scenario.starterPrompt;

  return (
    <div className="space-y-6">
      {/* Section 1: Animated Voice Partners Roster Across Fields & Voices */}
      <section id="partners" className="scroll-mt-20 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-medium text-emerald-700">
              ZenvoxSpeak Speaking Studio · {PERSONA_PROFILES.length} Animated Voice Partners · Infinite Healthy Conversations
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Speak with Animated AI Partners Across Every Field
            </h1>
          </div>

          {/* Theme Picker Trigger & Speaking Level Selector */}
          <div className="flex flex-wrap items-center gap-3 self-start lg:self-auto">
            <button
              type="button"
              onClick={() => setIsThemeModalOpen(true)}
              aria-haspopup="dialog"
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-900 transition hover:border-slate-900 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <LayoutGrid className="h-4 w-4 text-emerald-700" />
              <span>{activeTheme ? `Theme: ${activeTheme.title}` : 'Choose Theme'}</span>
            </button>

            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 whitespace-nowrap">Speaking level:</span>
              <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
                {CEFR_LEVELS.map((lvl) => {
                  const active = profile.level === lvl;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      aria-pressed={active}
                      onClick={() => updatePreferences({ level: lvl })}
                      className={`min-h-[34px] rounded-lg px-2.5 text-xs font-semibold transition whitespace-nowrap ${
                        active ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {lvl}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Field Filter Bar */}
        <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1" role="region" aria-label="Filter partners by field">
          {PARTNER_FIELDS.map((field) => {
            const active = selectedField === field;
            return (
              <button
                key={field}
                type="button"
                aria-pressed={active}
                onClick={() => setSelectedField(field)}
                className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {field}
              </button>
            );
          })}
        </div>

        {/* Animated Partner Cards Grid */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {visiblePartners.map((person, idx) => {
            const active = person.id === persona.id;
            return (
              <motion.button
                key={person.id}
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: idx * 0.03 }}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleSelectPersona(person)}
                aria-pressed={active}
                className={`flex items-start gap-3 rounded-2xl border p-3.5 text-left transition ${
                  active
                    ? 'border-slate-900 bg-slate-900 text-white shadow-xs'
                    : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <PersonaAvatarVisualizer personaId={person.id} name={person.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold">{person.name}</span>
                    <span className={`text-[11px] font-medium whitespace-nowrap ${active ? 'text-emerald-300' : 'text-emerald-700'}`}>
                      {person.voiceName}
                    </span>
                  </div>
                  <p className={`text-xs font-medium leading-snug ${active ? 'text-slate-200' : 'text-slate-700'}`}>
                    {person.role}
                  </p>
                  <p className={`mt-1 text-[11px] leading-snug ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                    {person.field} · {person.voiceToneLabel.split('·')[1]?.trim()}
                  </p>
                </div>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* Section 2: Live Animated Speaking Stage + Infinite Topics */}
      <section id="stage" className="scroll-mt-20 space-y-4">
        {/* Infinite Topics Launcher */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-emerald-700">
                Infinite Speaking Topics · {persona.field} & Beyond
              </p>
              <p className="text-xs text-slate-600">
                Speak with {persona.name} on any subject—career, travel, daily life, science, arts, or mindful habits.
              </p>
            </div>

            <form onSubmit={handleCustomTopicSubmit} className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:min-w-[540px]">
              <label htmlFor="infinite-topic-input" className="sr-only">
                Enter any topic for speaking practice
              </label>
              <input
                id="infinite-topic-input"
                type="text"
                value={customTopicInput}
                onChange={(e) => setCustomTopicInput(e.target.value)}
                placeholder={`Ask ${persona.name} to talk about ANY topic...`}
                className="min-h-[44px] min-w-[260px] flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:bg-white focus:outline-none"
              />
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="submit"
                  disabled={!customTopicInput.trim() || isGeneratingTopic}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                >
                  <Compass className="h-4 w-4 text-emerald-400" />
                  <span>{isGeneratingTopic ? 'Starting...' : 'Start Topic'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => launchInfiniteTopic(undefined, selectedDomain)}
                  disabled={isGeneratingTopic}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
                >
                  <Sparkles className="h-4 w-4 text-emerald-700" />
                  <span>Surprise Topic</span>
                </button>
              </div>
            </form>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {INFINITE_TOPIC_DOMAINS.map((domain) => {
              const active = selectedDomain === domain;
              return (
                <button
                  key={domain}
                  type="button"
                  onClick={() => {
                    setSelectedDomain(domain);
                    void launchInfiniteTopic(undefined, domain);
                  }}
                  className={`min-h-[36px] rounded-lg px-3 py-1 text-xs font-semibold transition whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-emerald-600 text-white'
                      : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {domain}
                </button>
              );
            })}
          </div>
        </div>

        {/* Two-Zone Interactive Speaking Stage */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Sticky Zone: Animated Persona Portrait + Voice Call Controls */}
          <aside className="space-y-4 lg:sticky lg:top-20 lg:col-span-5 lg:self-start">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={persona.id}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.2 }}
                >
                  <PersonaAvatarVisualizer
                    personaId={persona.id}
                    name={persona.name}
                    role={persona.role}
                    state={voiceState}
                    audioLevel={audioLevel}
                    size="lg"
                    statusLabel={voiceStatusLabel}
                    caption={latestTutorMessage}
                  />
                </motion.div>
              </AnimatePresence>

              <p className="mt-3 text-center text-xs text-slate-500">
                <span className="font-semibold text-slate-700">{persona.field}:</span> {persona.specialty}
              </p>

              {/* Call Controls & Two-Way Auto-Audio Toggle */}
              <div className="mt-5 space-y-2.5">
                {liveStatus === 'idle' ? (
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={startLiveVoiceCall}
                    disabled={isTimerExpired}
                    className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <PhoneCall className="h-4 w-4" />
                    <span>Call {persona.name} (Live Voice)</span>
                  </motion.button>
                ) : (
                  <div className="flex w-full items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleMute}
                      className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      {isMuted ? <MicOff className="h-4 w-4 text-red-600" /> : <Mic className="h-4 w-4 text-emerald-700" />}
                      <span>{isMuted ? 'Unmute Mic' : 'Mute Mic'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={endLiveVoiceCall}
                      className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
                    >
                      <PhoneOff className="h-4 w-4" />
                      <span>End Call</span>
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setAutoSpeakReplies((v) => !v)}
                    className={`inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                      autoSpeakReplies
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    {autoSpeakReplies ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                    <span>{autoSpeakReplies ? 'Auto-Audio Reply: ON' : 'Auto-Audio Reply: OFF'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => playPartnerAudio(latestTutorMessage)}
                    className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap"
                  >
                    <Volume2 className="h-3.5 w-3.5 text-emerald-700" />
                    <span>Replay Voice</span>
                  </button>
                </div>
              </div>
            </div>

            <VoiceConfigPanel
              partnerName={persona.name}
              baseStyle={persona.voiceStyle}
              value={voiceConfig}
              onChange={handleVoiceConfigChange}
              onPreview={handlePreviewVoiceDelivery}
              sessionTimerMinutes={sessionTimerMinutes}
              onSessionTimerChange={handleSessionTimerChange}
              timerRemainingSeconds={timerRemainingSeconds}
              isTimerRunning={sessionTimerMinutes > 0 && !isTimerPaused && !isTimerExpired}
              isTimerExpired={isTimerExpired}
              onToggleTimerPause={handleToggleTimerPause}
              onResetTimer={handleResetTimer}
              isBusy={isSending || isGeneratingTopic}
            />
          </aside>

          {/* Right Zone: Two-Way Spoken & Screen Conversation */}
          <div className="flex min-h-[580px] flex-col justify-between rounded-2xl border border-slate-200 bg-white lg:col-span-7">
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-emerald-700">
                    {scenario.communicationGoal || `${persona.field} · Healthy two-way English conversation`}
                    {sessionTimerMinutes > 0 && (
                      <span
                        className={`font-mono-tabular ${
                          isTimerExpired ? 'text-red-700 font-semibold' : 'text-slate-600'
                        }`}
                      >
                        {' · '}
                        {isTimerExpired
                          ? 'Timer ended'
                          : `Session timer: ${formatCountdownMmSs(timerRemainingSeconds)}`}
                      </span>
                    )}
                  </p>
                  <h2 className="mt-0.5 text-base font-bold text-slate-900">{scenario.title}</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Helpful phrases: {scenario.keyPhrases.join(' · ')}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSuggestReplies}
                    disabled={isLoadingSuggestions || isSending}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-emerald-700" />
                    <span>{isLoadingSuggestions ? 'Thinking...' : 'AI Reply Ideas'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRecapConversation}
                    disabled={isLoadingRecap || turns.length < 2}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap"
                  >
                    <ClipboardList className="h-3.5 w-3.5 text-slate-700" />
                    <span>{isLoadingRecap ? 'Summarizing...' : 'AI Recap'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Two-Way Conversation Feed */}
            <div ref={feedContainerRef} className="flex-1 space-y-4 overflow-y-auto p-5 max-h-[520px]">
              <AnimatePresence initial={false}>
                {turns.map((turn) => (
                  <motion.div
                    key={turn.id}
                    initial={{ opacity: 0, y: 12, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    className={`flex flex-col ${turn.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        turn.role === 'user'
                          ? 'bg-slate-900 text-white'
                          : 'border border-slate-200 bg-slate-50 text-slate-900'
                      }`}
                    >
                      <p className="mb-1 text-[11px] font-semibold opacity-70">
                        {turn.role === 'user' ? 'You' : `${persona.name} (${persona.voiceName})`}
                      </p>
                      <p>{turn.text}</p>
                      {turn.role === 'tutor' && (
                        <button
                          type="button"
                          onClick={() => playPartnerAudio(turn.text)}
                          aria-label={`Hear ${persona.name}'s reply`}
                          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                        >
                          <Volume2 className="h-3.5 w-3.5" />
                          <span>Speak Reply</span>
                        </button>
                      )}
                    </div>

                    {turn.role === 'user' && (turn.feedbackTip || turn.correctedSentence) && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.22, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
                        className="mt-2 max-w-[90%] rounded-xl border border-emerald-200 bg-emerald-50/75 p-3 text-xs text-slate-800"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-800">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {turn.toneNote || 'Healthy & Clear'}
                          </span>
                          {typeof turn.naturalnessScore === 'number' && (
                            <span className="font-mono-tabular font-semibold text-emerald-800">
                              {turn.naturalnessScore}% natural
                            </span>
                          )}
                        </div>
                        {turn.correctedSentence && (
                          <p className="mt-1.5 text-slate-900">
                            <strong>Smoother phrasing:</strong> "{turn.correctedSentence}"
                          </p>
                        )}
                        {turn.feedbackTip && (
                          <p className="mt-1 text-slate-700">{turn.feedbackTip}</p>
                        )}
                      </motion.div>
                    )}
                  </motion.div>
                ))}

                {isSending && (
                  <motion.div
                    key="tutor-thinking"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-start"
                  >
                    <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-600">
                      <span className="flex items-center gap-1" aria-hidden="true">
                        {[0, 1, 2].map((dot) => (
                          <motion.span
                            key={dot}
                            className="h-1.5 w-1.5 rounded-full bg-emerald-600"
                            animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                            transition={{ duration: 0.8, repeat: Infinity, delay: dot * 0.15 }}
                          />
                        ))}
                      </span>
                      <span>{persona.name} is preparing an audio & text reply...</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {liveUserPartial && (
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl bg-slate-700 px-4 py-2.5 text-sm text-white/90">
                    {liveUserPartial}
                  </div>
                </div>
              )}

              {liveTutorPartial && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-slate-900">
                    {liveTutorPartial}
                  </div>
                </div>
              )}
            </div>

            <LiveCallCorrectionsPanel
              partnerName={persona.name}
              isLoading={isReviewingLiveCall}
              review={liveCallReview}
              emptyNotice={liveCallEmptyNotice}
              onSpeakPhrase={(phrase) => {
                void playPartnerAudio(phrase);
              }}
              onDismiss={() => {
                setLiveCallReview(null);
                setLiveCallEmptyNotice(null);
              }}
            />

            {/* AI Recap Panel */}
            <AnimatePresence>
              {recapData && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="border-t border-slate-200 bg-emerald-50/50 px-4 py-3 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-slate-900">AI Conversation Takeaways</p>
                    <button
                      type="button"
                      onClick={() => setRecapData(null)}
                      className="font-medium text-slate-500 hover:text-slate-800"
                    >
                      Close
                    </button>
                  </div>
                  <p className="mt-1 text-slate-800">
                    <strong>Strength:</strong> {recapData.strength}
                  </p>
                  <p className="mt-1 text-slate-700">
                    <strong>Phrases to keep:</strong> {recapData.phrasesToKeep.join(' · ')}
                  </p>
                  <p className="mt-1 font-medium text-emerald-800">
                    Next step: {recapData.nextStep}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* AI Reply Suggestions or Polish Draft Drawer */}
            <AnimatePresence>
              {suggestions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="border-t border-slate-100 bg-slate-50/80 px-4 py-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-700">Tap an idea to say or adapt</p>
                    <button
                      type="button"
                      onClick={() => setSuggestions([])}
                      className="text-xs font-medium text-slate-500 hover:text-slate-800"
                    >
                      Dismiss
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {suggestions.map((s, idx) => (
                      <motion.button
                        key={`${s.tone}_${idx}`}
                        type="button"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        onClick={() => setInputText(s.phrase)}
                        className="rounded-xl border border-slate-200 bg-white p-2.5 text-left transition hover:border-slate-400"
                      >
                        <p className="text-[11px] font-semibold text-emerald-700">{s.tone}</p>
                        <p className="mt-0.5 text-xs font-medium text-slate-900">"{s.phrase}"</p>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}

              {polishData && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="border-t border-slate-100 bg-slate-50/80 px-4 py-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-700">AI Healthy Tone Polisher — {polishData.reason}</p>
                    <button
                      type="button"
                      onClick={() => setPolishData(null)}
                      className="text-xs font-medium text-slate-500 hover:text-slate-800"
                    >
                      Dismiss
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        setInputText(polishData.casual);
                        setPolishData(null);
                      }}
                      className="rounded-xl border border-slate-200 bg-white p-2.5 text-left hover:border-slate-400"
                    >
                      <p className="text-[11px] font-semibold text-emerald-700">Warm & Natural</p>
                      <p className="mt-0.5 text-xs font-medium text-slate-900">"{polishData.casual}"</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setInputText(polishData.polite);
                        setPolishData(null);
                      }}
                      className="rounded-xl border border-slate-200 bg-white p-2.5 text-left hover:border-slate-400"
                    >
                      <p className="text-[11px] font-semibold text-slate-700">Polite & Clear</p>
                      <p className="mt-0.5 text-xs font-medium text-slate-900">"{polishData.polite}"</p>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bottom Speaking & Reply Composer */}
            <div className="border-t border-slate-200 p-4">
              {isTimerExpired && (
                <div
                  role="status"
                  className="mb-3 flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-950 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 shrink-0 text-amber-700" />
                    <span>
                      {sessionTimerMinutes}-minute practice limit reached. Review your recap or reset to continue.
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleExtendTimer(5)}
                      className="inline-flex min-h-[34px] items-center rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
                    >
                      Extend +5 min
                    </button>
                    <button
                      type="button"
                      onClick={handleResetTimer}
                      className="inline-flex min-h-[34px] items-center rounded-lg border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-900 hover:bg-amber-100 whitespace-nowrap"
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSessionTimerChange(0)}
                      className="inline-flex min-h-[34px] items-center rounded-lg border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-900 hover:bg-amber-100 whitespace-nowrap"
                    >
                      No Limit
                    </button>
                  </div>
                </div>
              )}

              {errorMsg && (
                <div role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
                  {errorMsg}
                </div>
              )}

              <form onSubmit={handleSendText} className="flex items-center gap-2">
                {!isRecordingTurn ? (
                  <button
                    type="button"
                    onClick={startVoiceTurn}
                    disabled={isSending || liveStatus !== 'idle' || isTimerExpired}
                    aria-label="Speak voice message"
                    className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Mic className="h-4 w-4" />
                    <span>Speak</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopVoiceTurn}
                    aria-label="Stop recording and send"
                    className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl bg-red-600 px-3.5 text-xs font-semibold text-white hover:bg-red-700"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                    <span>Stop & Send</span>
                  </button>
                )}

                <label htmlFor="tutor-chat-input" className="sr-only">
                  Speak or type your English response
                </label>
                <input
                  id="tutor-chat-input"
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  disabled={isSending || isRecordingTurn || isTimerExpired}
                  placeholder={
                    isTimerExpired
                      ? 'Session limit reached — extend or reset timer to continue...'
                      : isRecordingTurn
                        ? `Listening... tap Stop & Send to hear ${persona.name}`
                        : `Speak or reply to ${persona.name}...`
                  }
                  className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:bg-white focus:outline-none disabled:opacity-60"
                />

                <button
                  type="button"
                  onClick={handlePolishDraft}
                  disabled={!inputText.trim() || isPolishing || isSending || isTimerExpired}
                  aria-label="Polish draft with AI"
                  title="Polish phrasing politely with AI"
                  className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
                >
                  <Wand2 className="h-4 w-4 text-emerald-700" />
                </button>

                <button
                  type="submit"
                  disabled={!inputText.trim() || isSending || isRecordingTurn || isTimerExpired}
                  aria-label="Send message"
                  className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  <span className="hidden sm:inline">{isSending ? 'Thinking...' : 'Send'}</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      <ThemeSelectorModal
        isOpen={isThemeModalOpen}
        currentPersona={persona}
        activeThemeId={activeTheme?.id ?? null}
        isSeeding={isGeneratingTopic}
        onClose={() => setIsThemeModalOpen(false)}
        onSeedTheme={seedConversationFromTheme}
      />
    </div>
  );
};
