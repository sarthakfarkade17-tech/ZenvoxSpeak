import React, { useEffect, useState } from 'react';
import { CalendarDays, LayoutDashboard, Loader2, LogOut, PhoneCall } from 'lucide-react';
import { AuthGatePage } from './components/AuthGatePage';
import { DashboardView } from './components/DashboardView';
import { HeatmapPageView } from './components/HeatmapPageView';
import { OfflineIndicator } from './components/PWAInstallBanner';
import { SpeakingStudioView } from './components/SpeakingStudioView';
import { PersonaAppearance } from './data/curriculum';
import { AppErrorBoundary, LearningProvider, useLearningStore } from './hooks/useLearningStore';

type AppPage = 'dashboard' | 'voice-call' | 'heatmap';

const NAV_PAGES: {
  id: AppPage;
  label: string;
  mobileLabel: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  { id: 'dashboard', label: 'Dashboard', mobileLabel: 'Dashboard', icon: LayoutDashboard },
  { id: 'voice-call', label: 'Voice Call', mobileLabel: 'Voice Call', icon: PhoneCall },
  { id: 'heatmap', label: 'Practice Heatmap', mobileLabel: 'Heatmap', icon: CalendarDays },
];

function parseHashToPage(): AppPage {
  if (typeof window === 'undefined') return 'dashboard';
  const hash = window.location.hash.replace(/^#/, '').toLowerCase();
  if (hash === 'voice-call') return 'voice-call';
  if (hash === 'heatmap') return 'heatmap';
  return 'dashboard';
}

const AppShell: React.FC = () => {
  const { authReady, user, isEmailVerified, signOut, syncError } = useLearningStore();
  const [activePage, setActivePage] = useState<AppPage>(() => parseHashToPage());
  const [selectedPersonaId, setSelectedPersonaId] = useState<PersonaAppearance>('maya');
  const isAuthenticated = Boolean(user && isEmailVerified);

  useEffect(() => {
    const onRouteChange = () => {
      setActivePage(parseHashToPage());
    };
    window.addEventListener('hashchange', onRouteChange);
    window.addEventListener('popstate', onRouteChange);
    return () => {
      window.removeEventListener('hashchange', onRouteChange);
      window.removeEventListener('popstate', onRouteChange);
    };
  }, []);

  useEffect(() => {
    if (!authReady || typeof window === 'undefined') return;
    const currentHash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
    if (!isAuthenticated) {
      if (!['signin', 'create-account', 'register', 'reset-password', 'verify-email'].includes(currentHash)) {
        window.history.replaceState(null, '', '#signin');
      }
    } else if (['', 'signin', 'create-account', 'register', 'reset-password', 'verify-email'].includes(currentHash)) {
      setActivePage('dashboard');
      window.history.replaceState(null, '', '#dashboard');
    }
  }, [authReady, isAuthenticated]);

  const navigateTo = (page: AppPage) => {
    setActivePage(page);
    if (typeof window !== 'undefined') {
      const targetHash = `#${page}`;
      if (window.location.hash !== targetHash) {
        window.history.pushState(null, '', targetHash);
      }
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  };

  const handleStartVoiceCall = (personaId?: PersonaAppearance) => {
    if (personaId) {
      setSelectedPersonaId(personaId);
    }
    navigateTo('voice-call');
  };

  const handleSignOut = async () => {
    await signOut();
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', '#signin');
    }
  };

  if (!authReady) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-slate-900">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-xs">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
          <div>
            <p className="text-sm font-bold tracking-tight text-slate-900">ZenvoxSpeak</p>
            <p className="text-xs text-slate-500">Checking your Firebase session...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <AuthGatePage />
        <OfflineIndicator />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 md:pb-8">
      {/* Sticky Top Bar (3-zone contract) */}
      <header className="sticky top-0 z-30 h-14 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-8 px-4 sm:px-6">
          {/* Zone 1: Single-element brand wordmark */}
          <button
            type="button"
            onClick={() => navigateTo('dashboard')}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            ZenvoxSpeak
          </button>

          {/* Zone 2: Clean single-line page navigation */}
          <nav aria-label="Primary navigation" className="hidden md:flex h-full items-center gap-7">
            {NAV_PAGES.map((item) => {
              const active = activePage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => navigateTo(item.id)}
                  className={`inline-flex h-full items-center border-b-2 text-sm transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'border-slate-900 font-semibold text-slate-900'
                      : 'border-transparent font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single primary action */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <LogOut className="h-3.5 w-3.5 text-slate-500" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Multi-Page Main Workspace */}
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {syncError && (
          <div role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
            {syncError}
          </div>
        )}

        {activePage === 'dashboard' && (
          <DashboardView
            selectedPersonaId={selectedPersonaId}
            onStartVoiceCall={handleStartVoiceCall}
            onOpenHeatmap={() => navigateTo('heatmap')}
          />
        )}

        {activePage === 'voice-call' && (
          <SpeakingStudioView
            initialPersonaId={selectedPersonaId}
            onPersonaChange={setSelectedPersonaId}
          />
        )}

        {activePage === 'heatmap' && (
          <HeatmapPageView onStartVoiceCall={() => handleStartVoiceCall(selectedPersonaId)} />
        )}
      </main>

      {/* Compact Mobile Bottom Page Switcher */}
      <nav
        aria-label="Mobile bottom navigation"
        className="fixed bottom-0 left-0 right-0 z-40 grid h-14 grid-cols-3 border-t border-slate-200 bg-white/95 backdrop-blur-md md:hidden"
      >
        {NAV_PAGES.map((item) => {
          const Icon = item.icon;
          const active = activePage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => navigateTo(item.id)}
              className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 transition-colors ${
                active ? 'text-emerald-700' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? 'stroke-[2.25]' : 'stroke-[1.75]'}`} />
              <span className={`text-[11px] leading-tight whitespace-nowrap ${active ? 'font-semibold' : 'font-medium'}`}>
                {item.mobileLabel}
              </span>
            </button>
          );
        })}
      </nav>

      <OfflineIndicator />
    </div>
  );
};

export default function App() {
  return (
    <AppErrorBoundary>
      <LearningProvider>
        <AppShell />
      </LearningProvider>
    </AppErrorBoundary>
  );
}

