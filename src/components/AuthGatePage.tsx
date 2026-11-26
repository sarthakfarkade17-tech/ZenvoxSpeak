import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Eye,
  EyeOff,
  LayoutDashboard,
  Loader2,
  MailCheck,
  PhoneCall,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useLearningStore } from '../hooks/useLearningStore';
import {
  AuthPageMode,
  CefrLevel,
  DAILY_GOAL_OPTIONS,
  parseAuthHashMode,
  validateEmailAddress,
  validateRegistrationInput,
  validateSignInInput,
} from '../utils/learningLogic';

const CEFR_OPTIONS: Array<{ level: CefrLevel; hint: string }> = [
  { level: 'A2', hint: 'Elementary' },
  { level: 'B1', hint: 'Intermediate' },
  { level: 'B2', hint: 'Upper-Int' },
  { level: 'C1', hint: 'Advanced' },
];

const GoogleMark: React.FC = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
    <path
      fill="#EA4335"
      d="M12 10.2v3.9h5.4c-.2 1.3-1.5 3.8-5.4 3.8-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.4 14.6 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12s4.3 9.5 9.5 9.5c5.5 0 9.1-3.9 9.1-9.3 0-.6-.1-1.1-.2-1.6H12z"
    />
    <path
      fill="#4285F4"
      d="M21.1 12.2c0-.6-.1-1.1-.2-1.6H12v3.9h5.4c-.3 1.4-1.1 2.5-2.2 3.2l3.4 2.6c2-1.8 3.1-4.5 3.1-8.1z"
    />
    <path
      fill="#FBBC05"
      d="M6.1 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3L2.6 7C1.9 8.5 1.5 10.2 1.5 12s.4 3.5 1.1 5l3.5-2.7z"
    />
    <path
      fill="#34A853"
      d="M12 21.5c2.6 0 4.8-.9 6.4-2.3l-3.4-2.6c-.9.6-2 .9-3 .9-2.3 0-4.3-1.5-5-3.6l-3.5 2.7c1.6 3.1 4.9 4.9 8.5 4.9z"
    />
  </svg>
);

export const AuthGatePage: React.FC = () => {
  const {
    user,
    isEmailVerified,
    isAuthenticating,
    syncError,
    authNotice,
    clearSyncError,
    signIn,
    signInWithEmailAccount,
    registerWithEmailAccount,
    requestPasswordReset,
    resendVerification,
    checkEmailVerified,
    signOut,
  } = useLearningStore();

  const [mode, setMode] = useState<AuthPageMode>(() =>
    typeof window !== 'undefined' ? parseAuthHashMode(window.location.hash) : 'signin'
  );
  const [localError, setLocalError] = useState<string | null>(null);

  // Sign-In fields
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [showSignInPassword, setShowSignInPassword] = useState(false);

  // Create-Account fields
  const [displayName, setDisplayName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [level, setLevel] = useState<CefrLevel>('B1');
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState<number>(15);

  // Password reset field
  const [resetEmail, setResetEmail] = useState('');

  useEffect(() => {
    const syncModeFromHash = () => {
      setMode(parseAuthHashMode(window.location.hash));
    };
    if (typeof window !== 'undefined') {
      const current = window.location.hash.replace(/^#\/?/, '').toLowerCase();
      if (!current || !['signin', 'create-account', 'register', 'reset-password', 'verify-email'].includes(current)) {
        window.history.replaceState(null, '', '#signin');
      }
      window.addEventListener('hashchange', syncModeFromHash);
      window.addEventListener('popstate', syncModeFromHash);
      return () => {
        window.removeEventListener('hashchange', syncModeFromHash);
        window.removeEventListener('popstate', syncModeFromHash);
      };
    }
    return undefined;
  }, []);

  const switchMode = (nextMode: AuthPageMode) => {
    setMode(nextMode);
    setLocalError(null);
    clearSyncError();
    if (nextMode === 'reset-password' && signInEmail.trim() && !resetEmail.trim()) {
      setResetEmail(signInEmail.trim());
    }
    if (typeof window !== 'undefined') {
      const targetHash = `#${nextMode}`;
      if (window.location.hash !== targetHash) {
        window.history.pushState(null, '', targetHash);
      }
    }
  };

  const handleGoogleAuth = async () => {
    setLocalError(null);
    if (mode === 'create-account') {
      await signIn({
        displayName,
        level,
        dailyGoalMinutes,
      });
      return;
    }
    await signIn();
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearSyncError();
    const validationError = validateSignInInput(signInEmail, signInPassword);
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    await signInWithEmailAccount(signInEmail, signInPassword);
  };

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearSyncError();
    const validationError = validateRegistrationInput({
      displayName,
      email: regEmail,
      password: regPassword,
      confirmPassword: regConfirmPassword,
    });
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    await registerWithEmailAccount({
      displayName,
      email: regEmail,
      password: regPassword,
      level,
      dailyGoalMinutes,
    });
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearSyncError();
    const emailErr = validateEmailAddress(resetEmail);
    if (emailErr) {
      setLocalError(emailErr);
      return;
    }
    await requestPasswordReset(resetEmail);
  };

  const displayedError = localError || syncError;
  const needsVerification = Boolean(user && !isEmailVerified);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Dedicated First-Page Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
            ZenvoxSpeak
          </span>
          <div className="flex items-center gap-3">
            {!needsVerification && (
              <div className="hidden sm:flex items-center gap-4 text-xs font-medium text-slate-600">
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className={mode === 'signin' ? 'font-semibold text-slate-900' : 'hover:text-slate-900'}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('create-account')}
                  className={mode === 'create-account' ? 'font-semibold text-slate-900' : 'hover:text-slate-900'}
                >
                  Create Account
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
          {/* Left Column: Focused Welcome Overview */}
          <section className="order-2 space-y-6 lg:order-1 lg:col-span-5">
            <div>
              <p className="text-xs font-semibold text-emerald-700">
                ZenvoxSpeak · Spoken English Practice Platform
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Sign in to access your English voice studio
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
                Sign in with Google or your email account to enter ZenvoxSpeak. Your voice sessions, grammar feedback, and daily heatmap stay private to your profile.
              </p>
            </div>

            <div className="space-y-4 border-t border-slate-200 pt-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <PhoneCall className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Live Voice Calls &amp; Post-Call Corrections</h2>
                  <p className="text-xs text-slate-600">
                    Talk with 8 animated AI voice partners and review phrasing tips right after hanging up.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-800">
                  <LayoutDashboard className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Progress Dashboard</h2>
                  <p className="text-xs text-slate-600">
                    Follow your fluency trend, CEFR target level, XP, and daily speaking minutes.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <CalendarDays className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Red &amp; Green Practice Heatmap</h2>
                  <p className="text-xs text-slate-600">
                    Track practiced streaks in green and missed days in red across your personal calendar.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Right Column: Dedicated Auth Card (Appears First on Mobile) */}
          <section className="order-1 lg:order-2 lg:col-span-7">
            <div className="mx-auto w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              {needsVerification ? (
                <div className="space-y-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                      <MailCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold tracking-tight text-slate-900">
                        Verify your email to enter ZenvoxSpeak
                      </h2>
                      <p className="mt-1 text-sm text-slate-600">
                        We sent a verification link to{' '}
                        <span className="font-semibold text-slate-900">{user?.email}</span>. Open the link in your inbox, then continue below.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      disabled={isAuthenticating}
                      onClick={checkEmailVerified}
                      className="inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-65"
                    >
                      {isAuthenticating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      <span>I&apos;ve Verified — Continue</span>
                    </button>

                    <button
                      type="button"
                      disabled={isAuthenticating}
                      onClick={resendVerification}
                      className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-65"
                    >
                      <RefreshCw className="h-4 w-4" />
                      <span>Resend Link</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={signOut}
                    className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                  >
                    Sign out and use another account
                  </button>
                </div>
              ) : (
                <>
                  {/* Mode Switcher Tabs (Sign In / Create Account) */}
                  {mode !== 'reset-password' ? (
                    <div
                      role="tablist"
                      aria-label="Account access mode"
                      className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={mode === 'signin'}
                        onClick={() => switchMode('signin')}
                        className={`min-h-[44px] rounded-lg px-3 text-sm font-semibold transition ${
                          mode === 'signin'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Sign In
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={mode === 'create-account'}
                        onClick={() => switchMode('create-account')}
                        className={`min-h-[44px] rounded-lg px-3 text-sm font-semibold transition ${
                          mode === 'create-account'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Create Account
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => switchMode('signin')}
                      className="inline-flex min-h-[38px] items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      <span>Back to Sign In</span>
                    </button>
                  )}

                  {/* SIGN IN VIEW */}
                  {mode === 'signin' && (
                    <div className="mt-5 space-y-4">
                      <div>
                        <h2 className="text-xl font-bold tracking-tight text-slate-900">
                          Welcome back
                        </h2>
                        <p className="mt-1 text-sm text-slate-600">
                          Choose Google or sign in with your email and password.
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={isAuthenticating}
                        onClick={handleGoogleAuth}
                        className="inline-flex min-h-[46px] w-full items-center justify-center gap-2.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-65"
                      >
                        <GoogleMark />
                        <span>Continue with Google</span>
                      </button>

                      <div className="relative flex items-center py-1">
                        <div className="grow border-t border-slate-200" />
                        <span className="mx-3 shrink-0 text-xs font-medium text-slate-500">
                          or sign in with email
                        </span>
                        <div className="grow border-t border-slate-200" />
                      </div>

                      <form onSubmit={handleEmailSignIn} noValidate className="space-y-3.5">
                        <div>
                          <label htmlFor="signin-email" className="block text-xs font-semibold text-slate-700">
                            Email Address
                          </label>
                          <input
                            id="signin-email"
                            type="email"
                            autoComplete="email"
                            value={signInEmail}
                            onChange={(e) => setSignInEmail(e.target.value)}
                            placeholder="you@example.com"
                            className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <label htmlFor="signin-password" className="block text-xs font-semibold text-slate-700">
                              Password
                            </label>
                            <button
                              type="button"
                              onClick={() => switchMode('reset-password')}
                              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                            >
                              Forgot password?
                            </button>
                          </div>
                          <div className="relative mt-1.5">
                            <input
                              id="signin-password"
                              type={showSignInPassword ? 'text' : 'password'}
                              autoComplete="current-password"
                              value={signInPassword}
                              onChange={(e) => setSignInPassword(e.target.value)}
                              placeholder="Enter your password"
                              className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pl-3.5 pr-11 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                            />
                            <button
                              type="button"
                              aria-label={showSignInPassword ? 'Hide password' : 'Show password'}
                              onClick={() => setShowSignInPassword((v) => !v)}
                              className="absolute inset-y-0 right-1 flex min-w-[40px] items-center justify-center text-slate-500 hover:text-slate-800"
                            >
                              {showSignInPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={isAuthenticating}
                          className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-65"
                        >
                          {isAuthenticating ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Signing in...</span>
                            </>
                          ) : (
                            <span>Sign In</span>
                          )}
                        </button>
                      </form>
                    </div>
                  )}

                  {/* CREATE ACCOUNT VIEW */}
                  {mode === 'create-account' && (
                    <div className="mt-5 space-y-4">
                      <div>
                        <h2 className="text-xl font-bold tracking-tight text-slate-900">
                          Create your ZenvoxSpeak account
                        </h2>
                        <p className="mt-1 text-sm text-slate-600">
                          Set your CEFR level &amp; daily goal, then sign up with Google or email.
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={isAuthenticating}
                        onClick={handleGoogleAuth}
                        className="inline-flex min-h-[46px] w-full items-center justify-center gap-2.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-65"
                      >
                        <GoogleMark />
                        <span>Continue with Google</span>
                      </button>

                      <div className="relative flex items-center py-0.5">
                        <div className="grow border-t border-slate-200" />
                        <span className="mx-3 shrink-0 text-xs font-medium text-slate-500">
                          or create account with email
                        </span>
                        <div className="grow border-t border-slate-200" />
                      </div>

                      <form onSubmit={handleEmailRegister} noValidate className="space-y-3.5">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <label htmlFor="register-display-name" className="block text-xs font-semibold text-slate-700">
                              Full Name
                            </label>
                            <input
                              id="register-display-name"
                              type="text"
                              autoComplete="name"
                              maxLength={80}
                              value={displayName}
                              onChange={(e) => setDisplayName(e.target.value)}
                              placeholder="Alex Rivera"
                              className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label htmlFor="register-email" className="block text-xs font-semibold text-slate-700">
                              Email Address
                            </label>
                            <input
                              id="register-email"
                              type="email"
                              autoComplete="email"
                              value={regEmail}
                              onChange={(e) => setRegEmail(e.target.value)}
                              placeholder="you@example.com"
                              className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <label htmlFor="register-password" className="block text-xs font-semibold text-slate-700">
                              Password (6+ chars)
                            </label>
                            <div className="relative mt-1">
                              <input
                                id="register-password"
                                type={showRegPassword ? 'text' : 'password'}
                                autoComplete="new-password"
                                value={regPassword}
                                onChange={(e) => setRegPassword(e.target.value)}
                                placeholder="Create password"
                                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pl-3.5 pr-11 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                              />
                              <button
                                type="button"
                                aria-label={showRegPassword ? 'Hide registration password' : 'Show registration password'}
                                onClick={() => setShowRegPassword((v) => !v)}
                                className="absolute inset-y-0 right-1 flex min-w-[40px] items-center justify-center text-slate-500 hover:text-slate-800"
                              >
                                {showRegPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>

                          <div>
                            <label htmlFor="register-confirm-password" className="block text-xs font-semibold text-slate-700">
                              Confirm Password
                            </label>
                            <input
                              id="register-confirm-password"
                              type={showRegPassword ? 'text' : 'password'}
                              autoComplete="new-password"
                              value={regConfirmPassword}
                              onChange={(e) => setRegConfirmPassword(e.target.value)}
                              placeholder="Repeat password"
                              className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <span className="block text-xs font-semibold text-slate-700">
                              Target CEFR Level
                            </span>
                            <div className="mt-1 grid grid-cols-4 gap-1.5">
                              {CEFR_OPTIONS.map((item) => {
                                const selected = level === item.level;
                                return (
                                  <button
                                    key={item.level}
                                    type="button"
                                    aria-pressed={selected}
                                    title={item.hint}
                                    onClick={() => setLevel(item.level)}
                                    className={`min-h-[40px] rounded-lg border text-xs font-bold transition ${
                                      selected
                                        ? 'border-slate-900 bg-slate-900 text-white'
                                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white'
                                    }`}
                                  >
                                    {item.level}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div>
                            <span className="block text-xs font-semibold text-slate-700">
                              Daily Speaking Goal
                            </span>
                            <div className="mt-1 grid grid-cols-4 gap-1.5">
                              {DAILY_GOAL_OPTIONS.map((mins) => {
                                const selected = dailyGoalMinutes === mins;
                                return (
                                  <button
                                    key={mins}
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() => setDailyGoalMinutes(mins)}
                                    className={`font-mono-tabular min-h-[40px] rounded-lg border text-xs font-semibold transition ${
                                      selected
                                        ? 'border-emerald-700 bg-emerald-600 text-white'
                                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white'
                                    }`}
                                  >
                                    {mins}m
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={isAuthenticating}
                          className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-65"
                        >
                          {isAuthenticating ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Creating account...</span>
                            </>
                          ) : (
                            <span>Create Account</span>
                          )}
                        </button>
                      </form>
                    </div>
                  )}

                  {/* RESET PASSWORD VIEW */}
                  {mode === 'reset-password' && (
                    <form onSubmit={handleResetSubmit} noValidate className="mt-4 space-y-4">
                      <div>
                        <h2 className="text-xl font-bold tracking-tight text-slate-900">
                          Reset your password
                        </h2>
                        <p className="mt-1 text-sm text-slate-600">
                          Enter the email linked to your ZenvoxSpeak account and we&apos;ll send a Firebase password reset link.
                        </p>
                      </div>

                      <div>
                        <label htmlFor="reset-email" className="block text-xs font-semibold text-slate-700">
                          Email Address
                        </label>
                        <input
                          id="reset-email"
                          type="email"
                          autoComplete="email"
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                          placeholder="you@example.com"
                          className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isAuthenticating}
                        className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-65"
                      >
                        {isAuthenticating ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Sending reset link...</span>
                          </>
                        ) : (
                          <span>Send Reset Link</span>
                        )}
                      </button>
                    </form>
                  )}
                </>
              )}

              {authNotice && (
                <div
                  role="status"
                  className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-relaxed text-emerald-900"
                >
                  {authNotice}
                </div>
              )}

              {displayedError && (
                <div
                  role="alert"
                  className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs leading-relaxed text-red-900"
                >
                  {displayedError}
                </div>
              )}

              <div className="mt-5 flex items-start gap-2.5 border-t border-slate-100 pt-4 text-xs text-slate-500">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                <span>
                  Secured by Google Firebase Authentication. Only signed-in, verified users can access ZenvoxSpeak.
                </span>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};
