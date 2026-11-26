import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  registerWithEmail,
  sendPasswordReset,
  sendVerificationEmail,
  signInWithEmail,
  signInWithGoogle,
  signOutUser,
  testFirestoreConnection,
} from '../firebase';
import {
  calculateNextStreak,
  calculateSessionXp,
  CefrLevel,
  clampString,
  formatFirebaseAuthError,
  getLocalIsoDate,
  normalizeRegistrationPreferences,
  PracticeMode,
  RegistrationPreferences,
  sanitizeDocumentId,
  updateRollingAverage,
} from '../utils/learningLogic';

export interface LearnerProfile {
  displayName: string;
  level: CefrLevel;
  dailyGoalMinutes: number;
  streakDays: number;
  xpTotal: number;
  lastPracticeDate: string;
  vocabMasteredCount: number;
  quizzesCompleted: number;
  pronunciationAvg: number;
}

export interface VocabProgressRecord {
  wordId: string;
  word: string;
  status: 'learning' | 'mastered';
  correctCount: number;
}

export interface PracticeSessionRecord {
  sessionId: string;
  mode: PracticeMode;
  topic: string;
  score: number;
  summary: string;
  createdAtLabel: string;
  practiceDate?: string;
  createdAtMs?: number;
}

const LOCAL_STORAGE_KEY = 'fluently_learner_state_v1';

const DEFAULT_PROFILE: LearnerProfile = {
  displayName: 'English Learner',
  level: 'B1',
  dailyGoalMinutes: 15,
  streakDays: 1,
  xpTotal: 45,
  lastPracticeDate: getLocalIsoDate(),
  vocabMasteredCount: 1,
  quizzesCompleted: 0,
  pronunciationAvg: 84,
};

const DEFAULT_VOCAB_PROGRESS: Record<string, VocabProgressRecord> = {
  vocab_catch_up: {
    wordId: 'vocab_catch_up',
    word: 'catch up',
    status: 'mastered',
    correctCount: 2,
  },
};

const DEFAULT_SESSIONS: PracticeSessionRecord[] = [
  {
    sessionId: 'seed_session_1',
    mode: 'tutor',
    topic: 'Everyday Small Talk',
    score: 88,
    summary: 'Practiced natural greetings and follow-up questions.',
    createdAtLabel: 'Today',
    practiceDate: getLocalIsoDate(),
  },
];

interface LocalPersistedState {
  profile: LearnerProfile;
  vocabProgress: Record<string, VocabProgressRecord>;
  sessions: PracticeSessionRecord[];
}

function loadLocalState(): LocalPersistedState {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
      return {
        profile: DEFAULT_PROFILE,
        vocabProgress: DEFAULT_VOCAB_PROGRESS,
        sessions: DEFAULT_SESSIONS,
      };
    }
    const parsed = JSON.parse(raw) as Partial<LocalPersistedState>;
    return {
      profile: { ...DEFAULT_PROFILE, ...(parsed.profile ?? {}) },
      vocabProgress: parsed.vocabProgress ?? DEFAULT_VOCAB_PROGRESS,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : DEFAULT_SESSIONS,
    };
  } catch {
    return {
      profile: DEFAULT_PROFILE,
      vocabProgress: DEFAULT_VOCAB_PROGRESS,
      sessions: DEFAULT_SESSIONS,
    };
  }
}

interface LearningContextValue {
  user: User | null;
  isEmailVerified: boolean;
  authReady: boolean;
  isAuthenticating: boolean;
  syncError: string | null;
  authNotice: string | null;
  clearSyncError: () => void;
  profile: LearnerProfile;
  vocabProgress: Record<string, VocabProgressRecord>;
  sessions: PracticeSessionRecord[];
  signIn: (registration?: Partial<RegistrationPreferences>) => Promise<boolean>;
  signInWithEmailAccount: (email: string, password: string) => Promise<boolean>;
  registerWithEmailAccount: (input: {
    displayName: string;
    email: string;
    password: string;
    level: CefrLevel;
    dailyGoalMinutes: number;
  }) => Promise<boolean>;
  requestPasswordReset: (email: string) => Promise<boolean>;
  resendVerification: () => Promise<boolean>;
  checkEmailVerified: () => Promise<boolean>;
  signOut: () => Promise<void>;
  updatePreferences: (updates: { level?: CefrLevel; dailyGoalMinutes?: number; displayName?: string }) => Promise<void>;
  recordVocabPractice: (wordId: string, word: string, isCorrect: boolean) => Promise<void>;
  recordPracticeSession: (input: {
    mode: PracticeMode;
    topic: string;
    score: number;
    summary: string;
  }) => Promise<void>;
}

const LearningContext = createContext<LearningContextValue | null>(null);

export const LearningProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialLocal = loadLocalState();
  const [user, setUser] = useState<User | null>(null);
  const [verificationTick, setVerificationTick] = useState(0);
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [profile, setProfile] = useState<LearnerProfile>(initialLocal.profile);
  const [vocabProgress, setVocabProgress] = useState<Record<string, VocabProgressRecord>>(
    initialLocal.vocabProgress
  );
  const [sessions, setSessions] = useState<PracticeSessionRecord[]>(initialLocal.sessions);
  const syncedVocabIdsRef = useRef<Set<string>>(new Set());
  const ensuringProfilePromiseRef = useRef<Promise<void> | null>(null);
  const pendingRegistrationRef = useRef<Partial<RegistrationPreferences> | null>(null);
  const isEmailVerified = Boolean(user && user.emailVerified);
  void verificationTick;

  useEffect(() => {
    testFirestoreConnection();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        LOCAL_STORAGE_KEY,
        JSON.stringify({ profile, vocabProgress, sessions })
      );
    } catch {
      // ignore storage quota errors
    }
  }, [profile, vocabProgress, sessions]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const ensureUserDocExists = useCallback(
    async (firebaseUser: User, fallbackProfile: LearnerProfile) => {
      if (ensuringProfilePromiseRef.current) {
        await ensuringProfilePromiseRef.current;
        return;
      }

      const task = (async () => {
        const userPath = `users/${firebaseUser.uid}`;
        const userRef = doc(db, 'users', firebaseUser.uid);
        try {
          const snap = await getDoc(userRef);
          const pendingReg = pendingRegistrationRef.current;
          if (!snap.exists()) {
            const normalized = normalizeRegistrationPreferences(
              pendingReg ?? {
                displayName: fallbackProfile.displayName,
                level: fallbackProfile.level,
                dailyGoalMinutes: fallbackProfile.dailyGoalMinutes,
              },
              firebaseUser.displayName
            );
            await setDoc(userRef, {
              uid: firebaseUser.uid,
              displayName: normalized.displayName,
              level: normalized.level,
              dailyGoalMinutes: normalized.dailyGoalMinutes,
              streakDays: Math.max(0, Math.min(10000, Math.round(fallbackProfile.streakDays || 1))),
              xpTotal: Math.max(0, Math.min(10000000, Math.round(fallbackProfile.xpTotal || 0))),
              lastPracticeDate: getLocalIsoDate(),
              vocabMasteredCount: Math.max(0, Math.min(100000, Math.round(fallbackProfile.vocabMasteredCount || 0))),
              quizzesCompleted: Math.max(0, Math.min(100000, Math.round(fallbackProfile.quizzesCompleted || 0))),
              pronunciationAvg: Math.max(0, Math.min(100, Number(fallbackProfile.pronunciationAvg || 84))),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            pendingRegistrationRef.current = null;
          } else if (pendingReg) {
            const normalized = normalizeRegistrationPreferences(pendingReg, firebaseUser.displayName);
            await updateDoc(userRef, {
              displayName: normalized.displayName,
              level: normalized.level,
              dailyGoalMinutes: normalized.dailyGoalMinutes,
              updatedAt: serverTimestamp(),
            });
            pendingRegistrationRef.current = null;
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, userPath);
        } finally {
          ensuringProfilePromiseRef.current = null;
        }
      })();

      ensuringProfilePromiseRef.current = task;
      await task;
    },
    []
  );

  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) {
      syncedVocabIdsRef.current = new Set();
      return;
    }

    const userPath = `users/${user.uid}`;
    const userRef = doc(db, 'users', user.uid);
    let profileBootstrapRequested = false;

    const unsubProfile = onSnapshot(
      userRef,
      async (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setProfile({
            displayName: typeof data.displayName === 'string' ? data.displayName : 'English Learner',
            level: (['A2', 'B1', 'B2', 'C1'].includes(data.level) ? data.level : 'B1') as CefrLevel,
            dailyGoalMinutes: typeof data.dailyGoalMinutes === 'number' ? data.dailyGoalMinutes : 15,
            streakDays: typeof data.streakDays === 'number' ? data.streakDays : 1,
            xpTotal: typeof data.xpTotal === 'number' ? data.xpTotal : 0,
            lastPracticeDate: typeof data.lastPracticeDate === 'string' ? data.lastPracticeDate : getLocalIsoDate(),
            vocabMasteredCount: typeof data.vocabMasteredCount === 'number' ? data.vocabMasteredCount : 0,
            quizzesCompleted: typeof data.quizzesCompleted === 'number' ? data.quizzesCompleted : 0,
            pronunciationAvg: typeof data.pronunciationAvg === 'number' ? data.pronunciationAvg : 84,
          });
        } else if (!profileBootstrapRequested) {
          profileBootstrapRequested = true;
          await ensureUserDocExists(user, profile);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, userPath);
      }
    );

    const vocabPath = `users/${user.uid}/vocabProgress`;
    const vocabQuery = query(
      collection(db, 'users', user.uid, 'vocabProgress'),
      where('userId', '==', user.uid)
    );
    const unsubVocab = onSnapshot(
      vocabQuery,
      (snap) => {
        const next: Record<string, VocabProgressRecord> = {};
        const nextIds = new Set<string>();
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          nextIds.add(docSnap.id);
          next[docSnap.id] = {
            wordId: docSnap.id,
            word: String(d.word ?? docSnap.id),
            status: d.status === 'mastered' ? 'mastered' : 'learning',
            correctCount: typeof d.correctCount === 'number' ? d.correctCount : 0,
          };
        });
        syncedVocabIdsRef.current = nextIds;
        setVocabProgress(next);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, vocabPath);
      }
    );

    const sessionsPath = `users/${user.uid}/practiceSessions`;
    const sessionsQuery = query(
      collection(db, 'users', user.uid, 'practiceSessions'),
      where('userId', '==', user.uid)
    );
    const unsubSessions = onSnapshot(
      sessionsQuery,
      (snap) => {
        const rawList: Array<PracticeSessionRecord & { sortMillis: number }> = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          const ts = d.createdAt as { toMillis?: () => number } | undefined;
          const millis = typeof ts?.toMillis === 'function' ? ts.toMillis() : 0;
          const practiceDate = millis > 0 ? getLocalIsoDate(new Date(millis)) : undefined;
          rawList.push({
            sessionId: docSnap.id,
            mode: (d.mode ?? 'tutor') as PracticeMode,
            topic: String(d.topic ?? 'Conversation Practice'),
            score: typeof d.score === 'number' ? d.score : 80,
            summary: String(d.summary ?? ''),
            createdAtLabel: practiceDate ?? 'Synced',
            practiceDate,
            createdAtMs: millis > 0 ? millis : undefined,
            sortMillis: millis,
          });
        });
        rawList.sort((a, b) => b.sortMillis - a.sortMillis);
        setSessions(rawList.slice(0, 200).map(({ sortMillis: _sortMillis, ...rest }) => rest));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, sessionsPath);
      }
    );

    return () => {
      unsubProfile();
      unsubVocab();
      unsubSessions();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, ensureUserDocExists, user, verificationTick]);

  const clearSyncError = useCallback(() => {
    setSyncError(null);
    setAuthNotice(null);
  }, []);

  const signIn = useCallback(
    async (registration?: Partial<RegistrationPreferences>): Promise<boolean> => {
      setSyncError(null);
      setAuthNotice(null);
      setIsAuthenticating(true);
      pendingRegistrationRef.current = registration ?? null;
      try {
        const credential = await signInWithGoogle();
        if (credential?.user && credential.user.emailVerified && registration) {
          await ensureUserDocExists(credential.user, {
            ...DEFAULT_PROFILE,
            ...normalizeRegistrationPreferences(registration, credential.user.displayName),
          });
        }
        return true;
      } catch (error) {
        pendingRegistrationRef.current = null;
        setSyncError(formatFirebaseAuthError(error));
        return false;
      } finally {
        setIsAuthenticating(false);
      }
    },
    [ensureUserDocExists]
  );

  const signInWithEmailAccount = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      setSyncError(null);
      setAuthNotice(null);
      setIsAuthenticating(true);
      pendingRegistrationRef.current = null;
      try {
        const credential = await signInWithEmail(email, password);
        if (credential.user && !credential.user.emailVerified) {
          setAuthNotice('Please verify your email address to enter ZenvoxSpeak. Check your inbox or click Resend below.');
        }
        return true;
      } catch (error) {
        setSyncError(formatFirebaseAuthError(error));
        return false;
      } finally {
        setIsAuthenticating(false);
      }
    },
    []
  );

  const registerWithEmailAccount = useCallback(
    async (input: {
      displayName: string;
      email: string;
      password: string;
      level: CefrLevel;
      dailyGoalMinutes: number;
    }): Promise<boolean> => {
      setSyncError(null);
      setAuthNotice(null);
      setIsAuthenticating(true);
      const regPrefs: Partial<RegistrationPreferences> = {
        displayName: input.displayName,
        level: input.level,
        dailyGoalMinutes: input.dailyGoalMinutes,
      };
      pendingRegistrationRef.current = regPrefs;
      try {
        const credential = await registerWithEmail(input.email, input.password, input.displayName);
        setAuthNotice(
          `Verification email sent to ${credential.user.email ?? input.email}. Open the link in your inbox, then click "I've Verified — Continue".`
        );
        return true;
      } catch (error) {
        pendingRegistrationRef.current = null;
        setSyncError(formatFirebaseAuthError(error));
        return false;
      } finally {
        setIsAuthenticating(false);
      }
    },
    []
  );

  const requestPasswordReset = useCallback(async (email: string): Promise<boolean> => {
    setSyncError(null);
    setAuthNotice(null);
    setIsAuthenticating(true);
    try {
      await sendPasswordReset(email);
      setAuthNotice(`Password reset email sent to ${email.trim()}. Check your inbox and spam folder.`);
      return true;
    } catch (error) {
      setSyncError(formatFirebaseAuthError(error));
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  const resendVerification = useCallback(async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    setSyncError(null);
    setAuthNotice(null);
    setIsAuthenticating(true);
    try {
      await sendVerificationEmail(auth.currentUser);
      setAuthNotice(`Verification link re-sent to ${auth.currentUser.email ?? 'your email'}.`);
      return true;
    } catch (error) {
      setSyncError(formatFirebaseAuthError(error));
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  const checkEmailVerified = useCallback(async (): Promise<boolean> => {
    const current = auth.currentUser;
    if (!current) return false;
    setSyncError(null);
    setAuthNotice(null);
    setIsAuthenticating(true);
    try {
      await current.reload();
      await current.getIdToken(true);
      setVerificationTick((t) => t + 1);
      if (current.emailVerified) {
        await ensureUserDocExists(current, {
          ...DEFAULT_PROFILE,
          ...normalizeRegistrationPreferences(pendingRegistrationRef.current, current.displayName),
        });
        return true;
      }
      setSyncError('Your email is not marked as verified yet. Open the verification link in your inbox and click Check Again.');
      return false;
    } catch (error) {
      setSyncError(formatFirebaseAuthError(error));
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, [ensureUserDocExists]);

  const signOut = useCallback(async () => {
    setSyncError(null);
    setAuthNotice(null);
    pendingRegistrationRef.current = null;
    try {
      await signOutUser();
      syncedVocabIdsRef.current = new Set();
      setProfile(DEFAULT_PROFILE);
      setVocabProgress(DEFAULT_VOCAB_PROGRESS);
      setSessions(DEFAULT_SESSIONS);
      try {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      } catch {
        // ignore storage errors
      }
    } catch (error) {
      setSyncError(formatFirebaseAuthError(error));
    }
  }, []);

  const updatePreferences = useCallback(
    async (updates: { level?: CefrLevel; dailyGoalMinutes?: number; displayName?: string }) => {
      const nextDisplayName = clampString(
        updates.displayName ?? profile.displayName,
        80,
        'English Learner'
      );
      const nextLevel = updates.level ?? profile.level;
      const nextGoal = Math.max(5, Math.min(180, Math.round(updates.dailyGoalMinutes ?? profile.dailyGoalMinutes)));

      setProfile((prev) => ({
        ...prev,
        displayName: nextDisplayName,
        level: nextLevel,
        dailyGoalMinutes: nextGoal,
      }));

      if (user && user.emailVerified) {
        const userPath = `users/${user.uid}`;
        try {
          await ensureUserDocExists(user, profile);
          await updateDoc(doc(db, 'users', user.uid), {
            displayName: nextDisplayName,
            level: nextLevel,
            dailyGoalMinutes: nextGoal,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, userPath);
        }
      }
    },
    [ensureUserDocExists, profile, user]
  );

  const recordVocabPractice = useCallback(
    async (wordIdRaw: string, wordRaw: string, isCorrect: boolean) => {
      const wordId = sanitizeDocumentId(wordIdRaw);
      const word = clampString(wordRaw, 120, 'phrase');
      const existing = vocabProgress[wordId];
      const nextCorrectCount = Math.round(
        isCorrect
          ? Math.min(10000, (existing?.correctCount ?? 0) + 1)
          : existing?.correctCount ?? 0
      );
      const nextStatus: 'learning' | 'mastered' = nextCorrectCount >= 1 && isCorrect ? 'mastered' : existing?.status ?? 'learning';

      const updatedMap = {
        ...vocabProgress,
        [wordId]: {
          wordId,
          word,
          status: nextStatus,
          correctCount: nextCorrectCount,
        },
      };
      setVocabProgress(updatedMap);

      const masteredCount = Object.values(updatedMap).filter((v) => v.status === 'mastered').length;
      const today = getLocalIsoDate();
      const nextStreak = Math.round(calculateNextStreak(profile.lastPracticeDate, today, profile.streakDays));
      const earnedXp = isCorrect ? calculateSessionXp('vocabulary', 100) : 5;
      const nextXp = Math.round(profile.xpTotal + earnedXp);

      setProfile((prev) => ({
        ...prev,
        streakDays: nextStreak,
        lastPracticeDate: today,
        xpTotal: nextXp,
        vocabMasteredCount: masteredCount,
      }));

      if (user && user.emailVerified) {
        const vocabPath = `users/${user.uid}/vocabProgress/${wordId}`;
        try {
          await ensureUserDocExists(user, profile);
          if (syncedVocabIdsRef.current.has(wordId)) {
            await updateDoc(doc(db, 'users', user.uid, 'vocabProgress', wordId), {
              status: nextStatus,
              correctCount: nextCorrectCount,
              updatedAt: serverTimestamp(),
            });
          } else {
            await setDoc(doc(db, 'users', user.uid, 'vocabProgress', wordId), {
              wordId,
              userId: user.uid,
              word,
              status: nextStatus,
              correctCount: nextCorrectCount,
              updatedAt: serverTimestamp(),
            });
            syncedVocabIdsRef.current.add(wordId);
          }
          await updateDoc(doc(db, 'users', user.uid), {
            streakDays: nextStreak,
            xpTotal: nextXp,
            lastPracticeDate: today,
            vocabMasteredCount: Math.round(masteredCount),
            quizzesCompleted: Math.round(profile.quizzesCompleted),
            pronunciationAvg: Number(profile.pronunciationAvg),
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, vocabPath);
        }
      }
    },
    [ensureUserDocExists, profile, user, vocabProgress]
  );

  const recordPracticeSession = useCallback(
    async (input: { mode: PracticeMode; topic: string; score: number; summary: string }) => {
      const sessionId = sanitizeDocumentId(`sess_${Date.now()}_${Math.floor(Math.random() * 1000)}`);
      const topic = clampString(input.topic, 120, 'English Conversation');
      const summary = clampString(input.summary, 600, 'Completed practice exercise.');
      const score = Math.max(0, Math.min(100, Math.round(input.score)));
      const today = getLocalIsoDate();
      const nextStreak = Math.round(calculateNextStreak(profile.lastPracticeDate, today, profile.streakDays));
      const nextXp = Math.round(profile.xpTotal + calculateSessionXp(input.mode, score));
      const nextQuizzes = Math.round(input.mode === 'grammar' ? profile.quizzesCompleted + 1 : profile.quizzesCompleted);
      const pronCount = sessions.filter((s) => s.mode === 'pronunciation').length;
      const nextPronAvg =
        input.mode === 'pronunciation'
          ? updateRollingAverage(profile.pronunciationAvg, pronCount, score)
          : profile.pronunciationAvg;

      const nowMs = Date.now();
      const newRecord: PracticeSessionRecord = {
        sessionId,
        mode: input.mode,
        topic,
        score,
        summary,
        createdAtLabel: 'Just now',
        practiceDate: today,
        createdAtMs: nowMs,
      };

      setSessions((prev) => [newRecord, ...prev].slice(0, 200));
      setProfile((prev) => ({
        ...prev,
        streakDays: nextStreak,
        lastPracticeDate: today,
        xpTotal: nextXp,
        quizzesCompleted: nextQuizzes,
        pronunciationAvg: nextPronAvg,
      }));

      if (user && user.emailVerified) {
        const sessionPath = `users/${user.uid}/practiceSessions/${sessionId}`;
        try {
          await ensureUserDocExists(user, profile);
          await setDoc(doc(db, 'users', user.uid, 'practiceSessions', sessionId), {
            sessionId,
            userId: user.uid,
            mode: input.mode,
            topic,
            score,
            summary,
            createdAt: serverTimestamp(),
          });
          await updateDoc(doc(db, 'users', user.uid), {
            streakDays: nextStreak,
            xpTotal: nextXp,
            lastPracticeDate: today,
            vocabMasteredCount: Math.round(profile.vocabMasteredCount),
            quizzesCompleted: nextQuizzes,
            pronunciationAvg: Number(nextPronAvg),
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, sessionPath);
        }
      }
    },
    [ensureUserDocExists, profile, sessions, user]
  );

  return (
    <LearningContext.Provider
      value={{
        user,
        isEmailVerified,
        authReady,
        isAuthenticating,
        syncError,
        authNotice,
        clearSyncError,
        profile,
        vocabProgress,
        sessions,
        signIn,
        signInWithEmailAccount,
        registerWithEmailAccount,
        requestPasswordReset,
        resendVerification,
        checkEmailVerified,
        signOut,
        updatePreferences,
        recordVocabPractice,
        recordPracticeSession,
      }}
    >
      {children}
    </LearningContext.Provider>
  );
};

export function useLearningStore() {
  const ctx = useContext(LearningContext);
  if (!ctx) {
    throw new Error('useLearningStore must be used inside LearningProvider');
  }
  return ctx;
}

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-lg font-semibold text-slate-900">Something interrupted your session</h1>
            <p className="mt-2 text-sm text-slate-600">
              Your local learning progress is safe. Reload to continue practicing.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 min-h-[44px] w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
