export type CefrLevel = 'A2' | 'B1' | 'B2' | 'C1';
export type PracticeMode = 'tutor' | 'pronunciation' | 'grammar' | 'vocabulary';

export interface WordComparisonResult {
  score: number;
  matchedCount: number;
  totalCount: number;
  wordStatuses: Array<{
    word: string;
    status: 'matched' | 'close' | 'missed';
  }>;
}

const CONTRACTION_EXPANSIONS: Record<string, string> = {
  "i'm": 'i am',
  "you're": 'you are',
  "we're": 'we are',
  "they're": 'they are',
  "it's": 'it is',
  "that's": 'that is',
  "there's": 'there is',
  "can't": 'cannot',
  "won't": 'will not',
  "don't": 'do not',
  "doesn't": 'does not',
  "didn't": 'did not',
  "isn't": 'is not',
  "aren't": 'are not',
  "wasn't": 'was not',
  "weren't": 'were not',
  "i'd": 'i would',
  "i'll": 'i will',
  "i've": 'i have',
  "we've": 'we have',
  "let's": 'let us',
};

export function normalizeEnglishWords(text: string): string[] {
  const cleaned = text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .replace(/-/g, ' ');

  const rawTokens = cleaned.split(/\s+/).filter(Boolean);
  const expanded: string[] = [];

  for (const token of rawTokens) {
    const replacement = CONTRACTION_EXPANSIONS[token];
    if (replacement) {
      expanded.push(...replacement.split(' '));
    } else {
      expanded.push(token.replace(/'/g, ''));
    }
  }

  return expanded.filter(Boolean);
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );

  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

export function evaluatePronunciationTranscript(
  targetPhrase: string,
  spokenTranscript: string
): WordComparisonResult {
  const displayTokens = targetPhrase.trim().split(/\s+/).filter(Boolean);
  const targetWords = normalizeEnglishWords(targetPhrase);
  const spokenWords = normalizeEnglishWords(spokenTranscript);

  if (targetWords.length === 0) {
    return { score: 0, matchedCount: 0, totalCount: 0, wordStatuses: [] };
  }

  const usedIndices = new Set<number>();
  let points = 0;
  let matchedCount = 0;

  const wordStatuses = displayTokens.map((displayWord, idx) => {
    const normalized = normalizeEnglishWords(displayWord)[0] ?? displayWord.toLowerCase();
    let bestIdx = -1;
    let bestStatus: 'matched' | 'close' | 'missed' = 'missed';

    for (let sIdx = 0; sIdx < spokenWords.length; sIdx++) {
      if (usedIndices.has(sIdx)) continue;
      if (spokenWords[sIdx] === normalized) {
        bestIdx = sIdx;
        bestStatus = 'matched';
        break;
      }
      const dist = levenshteinDistance(spokenWords[sIdx], normalized);
      if (normalized.length >= 3 && dist === 1 && bestStatus === 'missed') {
        bestIdx = sIdx;
        bestStatus = 'close';
      }
    }

    if (bestIdx !== -1) {
      usedIndices.add(bestIdx);
    }
    if (bestStatus === 'matched') {
      points += 1;
      matchedCount += 1;
    } else if (bestStatus === 'close') {
      points += 0.65;
    }

    void idx;
    return { word: displayWord, status: bestStatus };
  });

  const score = Math.max(0, Math.min(100, Math.round((points / displayTokens.length) * 100)));
  return {
    score,
    matchedCount,
    totalCount: displayTokens.length,
    wordStatuses,
  };
}

export function calculateNextStreak(
  lastPracticeDate: string,
  todayDate: string,
  currentStreak: number
): number {
  const safeStreak = Math.max(0, currentStreak);
  if (!lastPracticeDate) return 1;
  if (lastPracticeDate === todayDate) return Math.max(1, safeStreak);

  const prev = new Date(`${lastPracticeDate}T00:00:00Z`).getTime();
  const curr = new Date(`${todayDate}T00:00:00Z`).getTime();
  if (Number.isNaN(prev) || Number.isNaN(curr)) return 1;

  const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
  if (diffDays === 1) return safeStreak + 1;
  if (diffDays <= 0) return Math.max(1, safeStreak);
  return 1;
}

export function calculateSessionXp(mode: PracticeMode, score: number): number {
  const clampedScore = Math.max(0, Math.min(100, score));
  const base = mode === 'tutor' ? 25 : mode === 'pronunciation' ? 20 : 15;
  const bonus = Math.round((clampedScore / 100) * 15);
  return base + bonus;
}

export function updateRollingAverage(
  previousAvg: number,
  previousCount: number,
  newScore: number
): number {
  const clamped = Math.max(0, Math.min(100, newScore));
  if (previousCount <= 0) return Math.round(clamped);
  const total = previousAvg * previousCount + clamped;
  return Math.round(total / (previousCount + 1));
}

export function getLocalIsoDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function clampString(value: string, maxLength: number, fallback = 'Practice'): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLength);
}

export function sanitizeDocumentId(raw: string): string {
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  return (cleaned || 'item').slice(0, 128);
}

export function sanitizeConversationTopic(raw: string, fallback = 'Everyday Small Talk'): string {
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (!collapsed) return fallback;
  return collapsed.slice(0, 120);
}

export function computeMouthAperture(audioLevel: number, isSpeaking: boolean, phase = 0): number {
  if (!isSpeaking) return 0.08;
  const clamped = Math.max(0.15, Math.min(1, audioLevel));
  const modulation = 0.72 + 0.28 * Math.sin(phase);
  return Number(Math.max(0.18, Math.min(1, clamped * modulation)).toFixed(3));
}

export function filterPartnersByField<T extends { field: string }>(
  partners: T[],
  selectedField: string
): T[] {
  if (!selectedField || selectedField === 'All Fields') return partners;
  return partners.filter((partner) => partner.field === selectedField);
}

export function filterConversationThemes<
  T extends { title: string; category: string; tagline: string },
>(themes: T[], searchQuery: string, selectedCategory = 'All'): T[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  return themes.filter((theme) => {
    const matchesCategory =
      !selectedCategory || selectedCategory === 'All' || theme.category === selectedCategory;
    if (!matchesCategory) return false;
    if (!normalizedQuery) return true;
    return (
      theme.title.toLowerCase().includes(normalizedQuery) ||
      theme.category.toLowerCase().includes(normalizedQuery) ||
      theme.tagline.toLowerCase().includes(normalizedQuery)
    );
  });
}

export function buildThemeSeedRequest(input: {
  themeTitle: string;
  themeCategory: string;
  starterSeedContext: string;
  customAngle?: string;
}): { topicHint: string; domain: string; themeTitle: string; themeContext: string } {
  const cleanTitle = sanitizeConversationTopic(input.themeTitle, 'Everyday Conversation');
  const cleanAngle = input.customAngle ? sanitizeConversationTopic(input.customAngle, '') : '';
  const topicHint = cleanAngle ? `${cleanTitle}: ${cleanAngle}` : cleanTitle;
  return {
    topicHint,
    domain: input.themeCategory || cleanTitle,
    themeTitle: cleanTitle,
    themeContext: cleanAngle
      ? `${input.starterSeedContext} Focus specifically on: ${cleanAngle}.`
      : input.starterSeedContext,
  };
}

export type VoiceTone = 'friendly' | 'formal' | 'calm' | 'energetic';
export type VoicePace = 'slow' | 'normal' | 'fast';

export interface VoiceDeliveryConfig {
  tone: VoiceTone;
  pace: VoicePace;
}

const TONE_DESCRIPTIONS: Record<VoiceTone, { label: string; styleCue: string }> = {
  friendly: {
    label: 'Friendly',
    styleCue: 'warm, approachable, and conversational',
  },
  formal: {
    label: 'Formal',
    styleCue: 'polished, professional, and articulate',
  },
  calm: {
    label: 'Calm',
    styleCue: 'gentle, patient, and reassuring',
  },
  energetic: {
    label: 'Energetic',
    styleCue: 'upbeat, lively, and expressive',
  },
};

const PACE_SETTINGS: Record<VoicePace, { label: string; rate: number; styleCue: string }> = {
  slow: {
    label: 'Slow',
    rate: 0.85,
    styleCue: 'spoken at a deliberate, slower pace with crisp enunciation',
  },
  normal: {
    label: 'Normal',
    rate: 1.0,
    styleCue: 'spoken at a natural, balanced everyday pace',
  },
  fast: {
    label: 'Fast',
    rate: 1.18,
    styleCue: 'spoken at a brisk, fluent native pace',
  },
};

export function buildVoiceDeliveryStyle(
  baseStyle: string,
  config: VoiceDeliveryConfig
): { styleInstruction: string; playbackRate: number; deliveryLabel: string } {
  const toneInfo = TONE_DESCRIPTIONS[config.tone] ?? TONE_DESCRIPTIONS.friendly;
  const paceInfo = PACE_SETTINGS[config.pace] ?? PACE_SETTINGS.normal;
  const cleanBase = baseStyle.trim() || 'Clear standard English speaking partner';
  return {
    styleInstruction: `${cleanBase}; ${toneInfo.styleCue}; ${paceInfo.styleCue}.`,
    playbackRate: paceInfo.rate,
    deliveryLabel: `${toneInfo.label} tone · ${paceInfo.label} pace`,
  };
}

export function parseVoiceDeliveryConfig(raw: string | null): VoiceDeliveryConfig {
  const fallback: VoiceDeliveryConfig = { tone: 'friendly', pace: 'normal' };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<VoiceDeliveryConfig>;
    const tone: VoiceTone =
      parsed.tone === 'friendly' ||
      parsed.tone === 'formal' ||
      parsed.tone === 'calm' ||
      parsed.tone === 'energetic'
        ? parsed.tone
        : 'friendly';
    const pace: VoicePace =
      parsed.pace === 'slow' || parsed.pace === 'normal' || parsed.pace === 'fast'
        ? parsed.pace
        : 'normal';
    return { tone, pace };
  } catch {
    return fallback;
  }
}

export interface LiveTurnCorrectionInput {
  turnId: string;
  text: string;
}

export interface LiveTurnCorrection {
  turnId: string;
  originalText: string;
  correctedSentence: string;
  feedbackTip: string;
  toneNote: string;
  naturalnessScore: number;
  needsCorrection: boolean;
}

export interface LiveCallReviewResult {
  overallSummary: string;
  averageScore: number;
  corrections: LiveTurnCorrection[];
}

export function collectLiveCallUserTurns<T extends { id: string; role: 'user' | 'tutor'; text: string }>(
  turns: T[],
  startIndex: number,
  pendingPartialUserText = '',
  pendingTurnId = 'live_u_pending'
): LiveTurnCorrectionInput[] {
  const safeStart = Math.max(0, Math.min(startIndex, turns.length));
  const collected: LiveTurnCorrectionInput[] = [];
  const seenIds = new Set<string>();

  for (let i = safeStart; i < turns.length; i++) {
    const turn = turns[i];
    if (turn.role === 'user' && turn.text.trim()) {
      collected.push({ turnId: turn.id, text: turn.text.trim() });
      seenIds.add(turn.id);
    }
  }

  const cleanPending = pendingPartialUserText.trim();
  if (cleanPending && !seenIds.has(pendingTurnId)) {
    const lastText = collected[collected.length - 1]?.text;
    if (lastText !== cleanPending) {
      collected.push({ turnId: pendingTurnId, text: cleanPending });
    }
  }

  return collected;
}

export function mergeLiveCallCorrections<
  T extends {
    id: string;
    role: 'user' | 'tutor';
    text: string;
    correctedSentence?: string;
    feedbackTip?: string;
    toneNote?: string;
    naturalnessScore?: number;
  },
>(turns: T[], corrections: LiveTurnCorrection[]): T[] {
  if (corrections.length === 0) return turns;
  const byId = new Map<string, LiveTurnCorrection>();
  for (const item of corrections) {
    byId.set(item.turnId, item);
  }

  return turns.map((turn) => {
    const match = byId.get(turn.id);
    if (!match || turn.role !== 'user') return turn;
    return {
      ...turn,
      correctedSentence: match.correctedSentence,
      feedbackTip: match.feedbackTip,
      toneNote: match.toneNote,
      naturalnessScore: match.naturalnessScore,
    };
  });
}

export function computeAverageNaturalness(corrections: Array<{ naturalnessScore: number }>): number {
  if (corrections.length === 0) return 0;
  const total = corrections.reduce((sum, item) => {
    const clamped = Math.max(0, Math.min(100, Number(item.naturalnessScore) || 0));
    return sum + clamped;
  }, 0);
  return Math.round(total / corrections.length);
}

export interface HeatmapSessionInput {
  practiceDate?: string;
  createdAtMs?: number;
  createdAtLabel?: string;
  score?: number;
}

export interface HeatmapDayDatum {
  dateIso: string;
  date: Date;
  weekIndex: number;
  dayOfWeek: number;
  count: number;
  avgScore: number;
  intensity: 0 | 1 | 2 | 3 | 4;
  isCurrentStreak: boolean;
  isConsistentDay: boolean;
  isFuture: boolean;
}

export interface PracticeHeatmapSummary {
  days: HeatmapDayDatum[];
  weeksCount: number;
  totalSessions: number;
  activeDays: number;
  missedDays: number;
  consistentDays: number;
  currentStreak: number;
  longestStreak: number;
}

function parseLocalIsoDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dt = new Date(year, month - 1, day);
  if (
    dt.getFullYear() !== year ||
    dt.getMonth() !== month - 1 ||
    dt.getDate() !== day
  ) {
    return null;
  }
  return dt;
}

function addLocalDays(base: Date, deltaDays: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + deltaDays);
}

export function resolveSessionDateIso(
  session: HeatmapSessionInput,
  todayIso: string
): string | null {
  if (session.practiceDate && parseLocalIsoDate(session.practiceDate)) {
    return session.practiceDate;
  }
  if (typeof session.createdAtMs === 'number' && Number.isFinite(session.createdAtMs) && session.createdAtMs > 0) {
    return getLocalIsoDate(new Date(session.createdAtMs));
  }
  const label = (session.createdAtLabel ?? '').trim().toLowerCase();
  if (label === 'today' || label === 'just now') {
    return todayIso;
  }
  return null;
}

export function buildPracticeHeatmapData(
  sessions: HeatmapSessionInput[],
  options?: {
    weeks?: number;
    todayIso?: string;
    profileStreakDays?: number;
    lastPracticeDate?: string;
  }
): PracticeHeatmapSummary {
  const todayIso = options?.todayIso ?? getLocalIsoDate();
  const todayDate = parseLocalIsoDate(todayIso) ?? new Date();
  const normalizedToday = new Date(
    todayDate.getFullYear(),
    todayDate.getMonth(),
    todayDate.getDate()
  );
  const weeksCount = Math.max(4, Math.min(52, Math.round(options?.weeks ?? 20)));

  const dayMap = new Map<string, { count: number; scoreSum: number; scoreCount: number }>();
  for (const s of sessions) {
    const iso = resolveSessionDateIso(s, todayIso);
    if (!iso) continue;
    const prev = dayMap.get(iso) ?? { count: 0, scoreSum: 0, scoreCount: 0 };
    prev.count += 1;
    if (typeof s.score === 'number' && Number.isFinite(s.score)) {
      prev.scoreSum += Math.max(0, Math.min(100, s.score));
      prev.scoreCount += 1;
    }
    dayMap.set(iso, prev);
  }

  // Incorporate verified profile streak continuity if historical sessions exceeded local cache
  const profileStreakDays = Math.max(0, Math.round(options?.profileStreakDays ?? 0));
  const lastPracticeDate = options?.lastPracticeDate
    ? parseLocalIsoDate(options.lastPracticeDate)
    : null;
  if (profileStreakDays > 0 && lastPracticeDate) {
    const yesterdayIso = getLocalIsoDate(addLocalDays(normalizedToday, -1));
    const lastIso = getLocalIsoDate(lastPracticeDate);
    if (lastIso === todayIso || lastIso === yesterdayIso) {
      for (let i = 0; i < Math.min(profileStreakDays, weeksCount * 7); i++) {
        const dIso = getLocalIsoDate(addLocalDays(lastPracticeDate, -i));
        if (!dayMap.has(dIso)) {
          dayMap.set(dIso, { count: 1, scoreSum: 0, scoreCount: 0 });
        }
      }
    }
  }

  // Compute all consecutive active runs from the full date set
  const activeDatesSorted = Array.from(dayMap.entries())
    .filter(([, stats]) => stats.count > 0)
    .map(([iso]) => iso)
    .sort();

  const runs: string[][] = [];
  for (const iso of activeDatesSorted) {
    const dt = parseLocalIsoDate(iso);
    if (!dt) continue;
    const prevIso = getLocalIsoDate(addLocalDays(dt, -1));
    const lastRun = runs[runs.length - 1];
    if (lastRun && lastRun[lastRun.length - 1] === prevIso) {
      lastRun.push(iso);
    } else {
      runs.push([iso]);
    }
  }

  let longestStreak = 0;
  const multiDayRunSet = new Set<string>();
  for (const run of runs) {
    if (run.length > longestStreak) longestStreak = run.length;
    if (run.length >= 2) {
      for (const iso of run) multiDayRunSet.add(iso);
    }
  }

  const yesterdayIso = getLocalIsoDate(addLocalDays(normalizedToday, -1));
  const currentStreakSet = new Set<string>();
  let currentStreak = 0;
  for (let i = runs.length - 1; i >= 0; i--) {
    const run = runs[i];
    const endIso = run[run.length - 1];
    if (endIso === todayIso || endIso === yesterdayIso) {
      currentStreak = run.length;
      for (const iso of run) currentStreakSet.add(iso);
      break;
    }
  }
  if (profileStreakDays > currentStreak && lastPracticeDate) {
    const lastIso = getLocalIsoDate(lastPracticeDate);
    if (lastIso === todayIso || lastIso === yesterdayIso) {
      currentStreak = profileStreakDays;
      longestStreak = Math.max(longestStreak, profileStreakDays);
    }
  }

  // Build week-aligned calendar grid ending on the current week's Saturday
  const currentWeekSunday = addLocalDays(normalizedToday, -normalizedToday.getDay());
  const startSunday = addLocalDays(currentWeekSunday, -(weeksCount - 1) * 7);

  const days: HeatmapDayDatum[] = [];
  let totalSessions = 0;
  let activeDays = 0;
  let consistentDays = 0;

  for (let weekIndex = 0; weekIndex < weeksCount; weekIndex++) {
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      const cellDate = addLocalDays(startSunday, weekIndex * 7 + dayOfWeek);
      const dateIso = getLocalIsoDate(cellDate);
      const isFuture = cellDate.getTime() > normalizedToday.getTime();
      const stats = !isFuture ? dayMap.get(dateIso) : undefined;
      const count = stats?.count ?? 0;
      const avgScore =
        stats && stats.scoreCount > 0 ? Math.round(stats.scoreSum / stats.scoreCount) : 0;

      const intensity: 0 | 1 | 2 | 3 | 4 =
        count <= 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count <= 4 ? 3 : 4;
      const isCurrentStreak = !isFuture && currentStreakSet.has(dateIso);
      const isConsistentDay =
        !isFuture && count > 0 && (count >= 2 || multiDayRunSet.has(dateIso));

      if (!isFuture && count > 0) {
        totalSessions += count;
        activeDays += 1;
        if (isConsistentDay) consistentDays += 1;
      }

      days.push({
        dateIso,
        date: cellDate,
        weekIndex,
        dayOfWeek,
        count,
        avgScore,
        intensity,
        isCurrentStreak,
        isConsistentDay,
        isFuture,
      });
    }
  }

  const nonFutureDaysCount = days.filter((d) => !d.isFuture).length;
  const missedDays = Math.max(0, nonFutureDaysCount - activeDays);

  return {
    days,
    weeksCount,
    totalSessions,
    activeDays,
    missedDays,
    consistentDays,
    currentStreak,
    longestStreak,
  };
}

export type SessionTimerMinutes = 0 | 5 | 10 | 15;

export const SESSION_TIMER_OPTIONS: readonly SessionTimerMinutes[] = [0, 5, 10, 15];

export function parseSessionTimerMinutes(
  raw: string | number | null | undefined
): SessionTimerMinutes {
  if (raw === null || raw === undefined || raw === '') return 0;
  const parsed = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (parsed === 5 || parsed === 10 || parsed === 15) {
    return parsed;
  }
  return 0;
}

export function formatCountdownMmSs(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function computeRemainingTimerSeconds(
  limitMinutes: SessionTimerMinutes,
  elapsedSeconds: number
): number {
  if (limitMinutes <= 0) return 0;
  const total = limitMinutes * 60;
  const safeElapsed = Math.max(0, Math.floor(Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0));
  return Math.max(0, total - safeElapsed);
}

export interface DashboardSessionInput extends HeatmapSessionInput {
  sessionId?: string;
  mode?: string;
  topic?: string;
  summary?: string;
}

export interface FluencyTrendPoint {
  index: number;
  label: string;
  topic: string;
  score: number;
  dateIso: string;
}

export interface DashboardProgressSummary {
  totalCalls: number;
  averageScore: number;
  bestScore: number;
  sessionsLast7Days: number;
  sessionsToday: number;
  trendPoints: FluencyTrendPoint[];
}

export function buildDashboardProgressSummary(
  sessions: DashboardSessionInput[],
  todayIso = getLocalIsoDate()
): DashboardProgressSummary {
  const speaking = sessions.filter((s) => !s.mode || s.mode === 'tutor');
  const totalCalls = speaking.length;

  const scored = speaking.filter((s) => typeof s.score === 'number' && Number.isFinite(s.score));
  const averageScore =
    scored.length > 0
      ? Math.round(
          scored.reduce((sum, s) => sum + Math.max(0, Math.min(100, s.score ?? 0)), 0) /
            scored.length
        )
      : 0;
  const bestScore =
    scored.length > 0
      ? Math.max(...scored.map((s) => Math.max(0, Math.min(100, Math.round(s.score ?? 0)))))
      : 0;

  const todayDate = parseLocalIsoDate(todayIso) ?? new Date();
  const weekStartDate = addLocalDays(todayDate, -6);
  const weekStartIso = getLocalIsoDate(weekStartDate);

  let sessionsLast7Days = 0;
  let sessionsToday = 0;

  for (const s of speaking) {
    const iso = resolveSessionDateIso(s, todayIso);
    if (!iso) continue;
    if (iso === todayIso) sessionsToday += 1;
    if (iso >= weekStartIso && iso <= todayIso) sessionsLast7Days += 1;
  }

  // Chronological order (oldest -> newest) for up to 10 most recent calls
  const recentChronological = [...speaking].slice(0, 10).reverse();
  const trendPoints: FluencyTrendPoint[] = recentChronological.map((s, idx) => {
    const iso = resolveSessionDateIso(s, todayIso) ?? todayIso;
    const dt = parseLocalIsoDate(iso);
    const shortDate = dt
      ? `${dt.toLocaleString('en-US', { month: 'short' })} ${dt.getDate()}`
      : `#${idx + 1}`;
    return {
      index: idx + 1,
      label: `#${idx + 1} · ${shortDate}`,
      topic: (s.topic ?? 'Speaking Call').trim() || 'Speaking Call',
      score: Math.max(0, Math.min(100, Math.round(s.score ?? 0))),
      dateIso: iso,
    };
  });

  return {
    totalCalls,
    averageScore,
    bestScore,
    sessionsLast7Days,
    sessionsToday,
    trendPoints,
  };
}

export interface RegistrationPreferences {
  displayName?: string;
  level: CefrLevel;
  dailyGoalMinutes: number;
}

const VALID_CEFR_LEVELS: ReadonlySet<CefrLevel> = new Set(['A2', 'B1', 'B2', 'C1']);
export const DAILY_GOAL_OPTIONS = [10, 15, 20, 30] as const;

export function normalizeRegistrationPreferences(
  input: Partial<RegistrationPreferences> | null | undefined,
  googleDisplayName?: string | null
): { displayName: string; level: CefrLevel; dailyGoalMinutes: number } {
  const customName = (input?.displayName ?? '').replace(/\s+/g, ' ').trim();
  const fallbackGoogle = (googleDisplayName ?? '').replace(/\s+/g, ' ').trim();
  const displayName = clampString(customName || fallbackGoogle || 'English Learner', 80, 'English Learner');
  const rawLevel = input?.level;
  const level: CefrLevel = rawLevel && VALID_CEFR_LEVELS.has(rawLevel) ? rawLevel : 'B1';
  const rawGoal = Number(input?.dailyGoalMinutes);
  const dailyGoalMinutes = Number.isFinite(rawGoal)
    ? Math.max(5, Math.min(180, Math.round(rawGoal)))
    : 15;

  return {
    displayName,
    level,
    dailyGoalMinutes,
  };
}

export type AuthPageMode = 'signin' | 'create-account' | 'reset-password';

export function parseAuthHashMode(hash: string): AuthPageMode {
  const clean = hash.replace(/^#\/?/, '').trim().toLowerCase();
  if (clean === 'create-account' || clean === 'register' || clean === 'signup') {
    return 'create-account';
  }
  if (clean === 'reset-password' || clean === 'forgot-password') {
    return 'reset-password';
  }
  return 'signin';
}

export function validateEmailAddress(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) {
    return 'Please enter your email address.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
    return 'Please enter a valid email address.';
  }
  return null;
}

export function validateSignInInput(email: string, password: string): string | null {
  const emailErr = validateEmailAddress(email);
  if (emailErr) return emailErr;
  if (!password) {
    return 'Please enter your password.';
  }
  return null;
}

export function validateRegistrationInput(input: {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
}): string | null {
  const cleanName = input.displayName.replace(/\s+/g, ' ').trim();
  if (!cleanName) {
    return 'Please enter your full name.';
  }
  const emailErr = validateEmailAddress(input.email);
  if (emailErr) return emailErr;
  if (input.password.length < 6) {
    return 'Password must be at least 6 characters long.';
  }
  if (input.password !== input.confirmPassword) {
    return 'Passwords do not match. Please re-enter the same password.';
  }
  return null;
}

export function formatFirebaseAuthError(error: unknown): string {
  const raw =
    typeof error === 'string'
      ? error
      : error instanceof Error
      ? error.message
      : String(error ?? '');

  if (raw.includes('auth/popup-closed-by-user') || raw.includes('auth/cancelled-popup-request')) {
    return 'Google sign-in was closed before finishing. Click Continue with Google to try again.';
  }
  if (raw.includes('auth/popup-blocked')) {
    return 'Your browser blocked the Google sign-in popup. Allow popups for this site and try again.';
  }
  if (raw.includes('auth/unauthorized-domain')) {
    return 'This hostname is not authorized for Firebase Authentication yet. Add it under Firebase Console > Authentication > Settings > Authorized domains.';
  }
  if (raw.includes('auth/network-request-failed')) {
    return 'Network connection error while contacting Google Firebase. Check your internet connection and retry.';
  }
  if (raw.includes('auth/operation-not-allowed')) {
    return 'Email/Password sign-in is not enabled in Firebase Console yet. Enable Email/Password under Authentication > Sign-in method, or use Continue with Google.';
  }
  if (
    raw.includes('auth/invalid-credential') ||
    raw.includes('auth/wrong-password') ||
    raw.includes('auth/user-not-found')
  ) {
    return 'Incorrect email or password. Please check your credentials or use Forgot password.';
  }
  if (raw.includes('auth/email-already-in-use')) {
    return 'An account with this email already exists. Switch to Sign In or reset your password.';
  }
  if (raw.includes('auth/weak-password')) {
    return 'Password is too weak. Use at least 6 characters with a mix of letters and numbers.';
  }
  if (raw.includes('auth/invalid-email')) {
    return 'That email address format is invalid. Please check and try again.';
  }
  if (raw.includes('auth/too-many-requests')) {
    return 'Too many attempts. Please wait a few minutes before trying again.';
  }
  return raw.trim() || 'Authentication could not be completed. Please try again.';
}
