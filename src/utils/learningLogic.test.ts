import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDashboardProgressSummary,
  buildPracticeHeatmapData,
  buildThemeSeedRequest,
  buildVoiceDeliveryStyle,
  calculateNextStreak,
  calculateSessionXp,
  collectLiveCallUserTurns,
  computeAverageNaturalness,
  computeMouthAperture,
  computeRemainingTimerSeconds,
  evaluatePronunciationTranscript,
  filterConversationThemes,
  filterPartnersByField,
  formatCountdownMmSs,
  formatFirebaseAuthError,
  mergeLiveCallCorrections,
  normalizeEnglishWords,
  normalizeRegistrationPreferences,
  parseAuthHashMode,
  parseSessionTimerMinutes,
  parseVoiceDeliveryConfig,
  resolveSessionDateIso,
  sanitizeConversationTopic,
  sanitizeDocumentId,
  updateRollingAverage,
  validateEmailAddress,
  validateRegistrationInput,
  validateSignInInput,
} from './learningLogic';

test('normalizeEnglishWords expands contractions and removes punctuation', () => {
  assert.deepEqual(normalizeEnglishWords("I'm ready, let's catch-up!"), [
    'i',
    'am',
    'ready',
    'let',
    'us',
    'catch',
    'up',
  ]);
});

test('evaluatePronunciationTranscript scores exact match at 100%', () => {
  const res = evaluatePronunciationTranscript(
    'Could I get a medium iced latte?',
    'could i get a medium iced latte'
  );
  assert.equal(res.score, 100);
  assert.equal(res.matchedCount, 7);
  assert.ok(res.wordStatuses.every((w) => w.status === 'matched'));
});

test('evaluatePronunciationTranscript identifies missed and close words', () => {
  const res = evaluatePronunciationTranscript(
    'Would tomorrow afternoon work for you?',
    'would tomorow work'
  );
  assert.equal(res.totalCount, 6);
  assert.equal(res.wordStatuses[0].status, 'matched');
  assert.equal(res.wordStatuses[1].status, 'close');
  assert.equal(res.wordStatuses[2].status, 'missed');
  assert.equal(res.wordStatuses[3].status, 'matched');
  assert.ok(res.score > 30 && res.score < 70);
});

test('calculateNextStreak increments on consecutive days and resets after gap', () => {
  assert.equal(calculateNextStreak('2026-11-24', '2026-11-25', 4), 5);
  assert.equal(calculateNextStreak('2026-11-25', '2026-11-25', 4), 4);
  assert.equal(calculateNextStreak('2026-11-20', '2026-11-25', 4), 1);
});

test('calculateSessionXp and updateRollingAverage stay bounded', () => {
  assert.equal(calculateSessionXp('tutor', 100), 40);
  assert.equal(calculateSessionXp('grammar', 0), 15);
  assert.equal(updateRollingAverage(80, 2, 95), 85);
  assert.equal(updateRollingAverage(0, 0, 140), 100);
});

test('sanitizeDocumentId enforces safe Firestore ID characters', () => {
  assert.equal(sanitizeDocumentId('vocab/catch up!'), 'vocab_catch_up_');
  assert.equal(sanitizeDocumentId(''), 'item');
});

test('sanitizeConversationTopic normalizes whitespace and enforces bounds', () => {
  assert.equal(sanitizeConversationTopic('   Space   travel   ideas  '), 'Space travel ideas');
  assert.equal(sanitizeConversationTopic('   ', 'Default Topic'), 'Default Topic');
  assert.equal(sanitizeConversationTopic('a'.repeat(180)).length, 120);
});

test('computeMouthAperture stays within safe animation bounds', () => {
  assert.equal(computeMouthAperture(0.9, false, 0), 0.08);
  const active = computeMouthAperture(0.8, true, Math.PI / 2);
  assert.ok(active >= 0.18 && active <= 1);
});

test('filterPartnersByField filters correctly and returns all for All Fields', () => {
  const sample = [
    { name: 'Maya', field: 'Everyday & Social' },
    { name: 'Marcus', field: 'Career & Business' },
    { name: 'Liam', field: 'Tech & Science' },
  ];
  assert.equal(filterPartnersByField(sample, 'All Fields').length, 3);
  assert.deepEqual(
    filterPartnersByField(sample, 'Tech & Science').map((p) => p.name),
    ['Liam']
  );
  assert.equal(filterPartnersByField(sample, 'Arts & Creative').length, 0);
});

test('filterConversationThemes matches query and category cleanly', () => {
  const themes = [
    { title: 'Job Interview', category: 'Career & Business', tagline: 'Behavioral interview practice' },
    { title: 'Travel', category: 'Travel & Culture', tagline: 'Hotels, airports, and cafes' },
    { title: 'Academic Discussion', category: 'Tech & Science', tagline: 'Weigh evidence politely' },
  ];
  assert.equal(filterConversationThemes(themes, '', 'All').length, 3);
  assert.deepEqual(
    filterConversationThemes(themes, 'hotel', 'All').map((t) => t.title),
    ['Travel']
  );
  assert.deepEqual(
    filterConversationThemes(themes, '', 'Career & Business').map((t) => t.title),
    ['Job Interview']
  );
});

test('buildThemeSeedRequest formats topicHint and context with optional custom angle', () => {
  const basic = buildThemeSeedRequest({
    themeTitle: 'Job Interview',
    themeCategory: 'Career & Business',
    starterSeedContext: 'Behavioral interview simulation.',
  });
  assert.equal(basic.topicHint, 'Job Interview');
  assert.equal(basic.domain, 'Career & Business');
  assert.equal(basic.themeContext, 'Behavioral interview simulation.');

  const focused = buildThemeSeedRequest({
    themeTitle: 'Travel',
    themeCategory: 'Travel & Culture',
    starterSeedContext: 'City travel scenario.',
    customAngle: '  Checking into a boutique hotel in Lisbon  ',
  });
  assert.equal(focused.topicHint, 'Travel: Checking into a boutique hotel in Lisbon');
  assert.match(focused.themeContext, /boutique hotel in Lisbon/);
});

test('buildVoiceDeliveryStyle maps tone and pace into playbackRate and instruction', () => {
  const formalSlow = buildVoiceDeliveryStyle('Executive mentor', { tone: 'formal', pace: 'slow' });
  assert.equal(formalSlow.playbackRate, 0.85);
  assert.equal(formalSlow.deliveryLabel, 'Formal tone · Slow pace');
  assert.match(formalSlow.styleInstruction, /polished, professional/i);
  assert.match(formalSlow.styleInstruction, /slower pace/i);

  const energeticFast = buildVoiceDeliveryStyle('Tech builder', { tone: 'energetic', pace: 'fast' });
  assert.equal(energeticFast.playbackRate, 1.18);
  assert.equal(energeticFast.deliveryLabel, 'Energetic tone · Fast pace');
});

test('parseVoiceDeliveryConfig safely validates stored configs and falls back cleanly', () => {
  assert.deepEqual(parseVoiceDeliveryConfig(null), { tone: 'friendly', pace: 'normal' });
  assert.deepEqual(parseVoiceDeliveryConfig('{"tone":"formal","pace":"fast"}'), {
    tone: 'formal',
    pace: 'fast',
  });
  assert.deepEqual(parseVoiceDeliveryConfig('{"tone":"robot","pace":"warp"}'), {
    tone: 'friendly',
    pace: 'normal',
  });
  assert.deepEqual(parseVoiceDeliveryConfig('{bad json'), { tone: 'friendly', pace: 'normal' });
});

test('collectLiveCallUserTurns slices from call start and captures flushed partial text', () => {
  const turns = [
    { id: 'old_u', role: 'user' as const, text: 'Before call' },
    { id: 'live_t1', role: 'tutor' as const, text: 'Hi, how are you?' },
    { id: 'live_u1', role: 'user' as const, text: 'I am go to market yesterday.' },
  ];
  const collected = collectLiveCallUserTurns(turns, 1, 'And I buyed apples.', 'live_u_tail');
  assert.deepEqual(collected, [
    { turnId: 'live_u1', text: 'I am go to market yesterday.' },
    { turnId: 'live_u_tail', text: 'And I buyed apples.' },
  ]);
});

test('mergeLiveCallCorrections attaches corrections to matching user turns and averages scores', () => {
  const turns: Array<{
    id: string;
    role: 'user' | 'tutor';
    text: string;
    correctedSentence?: string;
    feedbackTip?: string;
    toneNote?: string;
    naturalnessScore?: number;
  }> = [
    { id: 'live_u1', role: 'user', text: 'I am go to market yesterday.' },
    { id: 'live_t1', role: 'tutor', text: 'Oh nice! What did you get?' },
  ];
  const corrections = [
    {
      turnId: 'live_u1',
      originalText: 'I am go to market yesterday.',
      correctedSentence: 'I went to the market yesterday.',
      feedbackTip: 'Use past tense "went" and include "the" before market.',
      toneNote: 'Friendly & clear',
      naturalnessScore: 78,
      needsCorrection: true,
    },
  ];
  const merged = mergeLiveCallCorrections(turns, corrections);
  assert.equal(merged[0].correctedSentence, 'I went to the market yesterday.');
  assert.equal(merged[0].naturalnessScore, 78);
  assert.equal(merged[1].correctedSentence, undefined);
  assert.equal(computeAverageNaturalness(corrections), 78);
});

test('resolveSessionDateIso extracts YYYY-MM-DD from practiceDate, createdAtMs, or Today label', () => {
  assert.equal(resolveSessionDateIso({ practiceDate: '2026-11-24' }, '2026-11-26'), '2026-11-24');
  assert.equal(resolveSessionDateIso({ createdAtLabel: 'Just now' }, '2026-11-26'), '2026-11-26');
  assert.equal(resolveSessionDateIso({ createdAtLabel: 'Synced' }, '2026-11-26'), null);
  const sampleMs = new Date(2026, 10, 20, 14, 30, 0).getTime();
  assert.equal(resolveSessionDateIso({ createdAtMs: sampleMs }, '2026-11-26'), '2026-11-20');
});

test('buildPracticeHeatmapData computes calendar grid, streaks, intensity, and consistent days', () => {
  const sessions = [
    // Older 4-day streak (Nov 10..13)
    { practiceDate: '2026-11-10', score: 80 },
    { practiceDate: '2026-11-11', score: 84 },
    { practiceDate: '2026-11-12', score: 86 },
    { practiceDate: '2026-11-13', score: 90 },
    // Current 3-day streak ending today (Nov 24..26) with multiple sessions today
    { practiceDate: '2026-11-24', score: 85 },
    { practiceDate: '2026-11-25', score: 90 },
    { practiceDate: '2026-11-26', score: 92 },
    { practiceDate: '2026-11-26', score: 96 },
    { practiceDate: '2026-11-26', score: 88 },
  ];
  const summary = buildPracticeHeatmapData(sessions, {
    weeks: 12,
    todayIso: '2026-11-26',
  });
  assert.equal(summary.weeksCount, 12);
  assert.equal(summary.days.length, 84);
  assert.equal(summary.totalSessions, 9);
  assert.equal(summary.activeDays, 7);
  assert.equal(summary.consistentDays, 7);
  assert.equal(summary.currentStreak, 3);
  assert.equal(summary.longestStreak, 4);

  const todayCell = summary.days.find((d) => d.dateIso === '2026-11-26');
  assert.ok(todayCell);
  assert.equal(todayCell.count, 3);
  assert.equal(todayCell.intensity, 3);
  assert.equal(todayCell.avgScore, 92);
  assert.equal(todayCell.isCurrentStreak, true);
  assert.equal(todayCell.isConsistentDay, true);
  assert.equal(todayCell.isFuture, false);

  const futureCell = summary.days.find((d) => d.dateIso === '2026-11-28');
  assert.ok(futureCell);
  assert.equal(futureCell.isFuture, true);
  assert.equal(futureCell.count, 0);
});

test('session timer parsing and countdown helpers validate limits and format mm:ss cleanly', () => {
  assert.equal(parseSessionTimerMinutes(null), 0);
  assert.equal(parseSessionTimerMinutes('5'), 5);
  assert.equal(parseSessionTimerMinutes(10), 10);
  assert.equal(parseSessionTimerMinutes('15'), 15);
  assert.equal(parseSessionTimerMinutes('99'), 0);
  assert.equal(parseSessionTimerMinutes('invalid'), 0);

  assert.equal(formatCountdownMmSs(600), '10:00');
  assert.equal(formatCountdownMmSs(65), '01:05');
  assert.equal(formatCountdownMmSs(0), '00:00');
  assert.equal(formatCountdownMmSs(-12), '00:00');

  assert.equal(computeRemainingTimerSeconds(0, 120), 0);
  assert.equal(computeRemainingTimerSeconds(5, 0), 300);
  assert.equal(computeRemainingTimerSeconds(5, 75), 225);
  assert.equal(computeRemainingTimerSeconds(5, 450), 0);
});

test('buildPracticeHeatmapData tracks missedDays and buildDashboardProgressSummary aggregates metrics', () => {
  const sessions = [
    { sessionId: 'c3', mode: 'tutor', topic: 'Tech Talk', score: 94, practiceDate: '2026-11-26' },
    { sessionId: 'c2', mode: 'tutor', topic: 'Travel Chat', score: 86, practiceDate: '2026-11-24' },
    { sessionId: 'c1', mode: 'tutor', topic: 'Job Prep', score: 80, practiceDate: '2026-11-12' },
    { sessionId: 'ignored', mode: 'grammar', topic: 'Other', score: 50, practiceDate: '2026-11-26' },
  ];

  const heatmap = buildPracticeHeatmapData(sessions, {
    weeks: 12,
    todayIso: '2026-11-26',
  });
  const nonFutureCount = heatmap.days.filter((d) => !d.isFuture).length;
  assert.equal(heatmap.missedDays, nonFutureCount - heatmap.activeDays);
  assert.ok(heatmap.missedDays > 0);

  const dash = buildDashboardProgressSummary(sessions, '2026-11-26');
  assert.equal(dash.totalCalls, 3);
  assert.equal(dash.averageScore, 87);
  assert.equal(dash.bestScore, 94);
  assert.equal(dash.sessionsLast7Days, 2);
  assert.equal(dash.sessionsToday, 1);
  assert.equal(dash.trendPoints.length, 3);
  assert.equal(dash.trendPoints[0].topic, 'Job Prep');
  assert.equal(dash.trendPoints[2].topic, 'Tech Talk');
});

test('normalizeRegistrationPreferences validates displayName, CEFR level, and daily goal bounds', () => {
  const custom = normalizeRegistrationPreferences(
    { displayName: '  Alex   Rivera  ', level: 'C1', dailyGoalMinutes: 25 },
    'Google User'
  );
  assert.equal(custom.displayName, 'Alex Rivera');
  assert.equal(custom.level, 'C1');
  assert.equal(custom.dailyGoalMinutes, 25);

  const fallback = normalizeRegistrationPreferences(
    { displayName: '   ', level: 'INVALID' as never, dailyGoalMinutes: 999 },
    'Maya Lin'
  );
  assert.equal(fallback.displayName, 'Maya Lin');
  assert.equal(fallback.level, 'B1');
  assert.equal(fallback.dailyGoalMinutes, 180);
});

test('formatFirebaseAuthError maps common Firebase Auth codes to helpful messages', () => {
  assert.match(formatFirebaseAuthError(new Error('Firebase: Error (auth/popup-closed-by-user).')), /closed before finishing/i);
  assert.match(formatFirebaseAuthError('auth/popup-blocked'), /blocked the Google sign-in popup/i);
  assert.match(formatFirebaseAuthError('auth/unauthorized-domain'), /Authorized domains/i);
  assert.match(formatFirebaseAuthError('auth/network-request-failed'), /Network connection error/i);
  assert.match(formatFirebaseAuthError('auth/invalid-credential'), /Incorrect email or password/i);
  assert.match(formatFirebaseAuthError('auth/email-already-in-use'), /already exists/i);
  assert.match(formatFirebaseAuthError('auth/operation-not-allowed'), /Authentication > Sign-in method/i);
});

test('auth hash parser and email/password validators enforce clean rules', () => {
  assert.equal(parseAuthHashMode('#create-account'), 'create-account');
  assert.equal(parseAuthHashMode('#register'), 'create-account');
  assert.equal(parseAuthHashMode('#reset-password'), 'reset-password');
  assert.equal(parseAuthHashMode('#voice-call'), 'signin');
  assert.equal(parseAuthHashMode(''), 'signin');

  assert.ok(validateEmailAddress(''));
  assert.ok(validateEmailAddress('not-an-email'));
  assert.equal(validateEmailAddress('learner@example.com'), null);

  assert.ok(validateSignInInput('learner@example.com', ''));
  assert.equal(validateSignInInput('learner@example.com', 'secret123'), null);

  assert.ok(
    validateRegistrationInput({
      displayName: '   ',
      email: 'learner@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    })
  );
  assert.ok(
    validateRegistrationInput({
      displayName: 'Alex Rivera',
      email: 'learner@example.com',
      password: '123',
      confirmPassword: '123',
    })
  );
  assert.ok(
    validateRegistrationInput({
      displayName: 'Alex Rivera',
      email: 'learner@example.com',
      password: 'password123',
      confirmPassword: 'password999',
    })
  );
  assert.equal(
    validateRegistrationInput({
      displayName: 'Alex Rivera',
      email: 'learner@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    }),
    null
  );
});


