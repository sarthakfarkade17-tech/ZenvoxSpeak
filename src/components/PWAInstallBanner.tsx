import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ variant?: 'compact' | 'card' }> = ({
  variant = 'compact',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={
          variant === 'card'
            ? 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 whitespace-nowrap shrink-0'
            : 'inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 whitespace-nowrap shrink-0'
        }
      >
        <Download className="h-4 w-4 shrink-0" />
        <span>Install Android App</span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className={
          variant === 'card'
            ? 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 whitespace-nowrap shrink-0'
            : 'inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 whitespace-nowrap shrink-0'
        }
      >
        <Smartphone className="h-4 w-4 shrink-0" />
        <span>Mobile App</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-guide-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="install-guide-title" className="text-lg font-semibold text-slate-900">
                  Install ZenvoxSpeak on your phone
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {isIOS
                    ? 'Add ZenvoxSpeak to your iPhone or iPad Home Screen for full-screen practice.'
                    : 'Install ZenvoxSpeak on Android Chrome for an instant app icon and offline exercises.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close install instructions"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <ol className="mt-4 space-y-2.5 text-sm text-slate-700">
              {isIOS ? (
                <>
                  <li>1. Tap the <strong>Share</strong> icon in Safari.</li>
                  <li>2. Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                  <li>3. Tap <strong>Add</strong> to launch ZenvoxSpeak full-screen.</li>
                </>
              ) : (
                <>
                  <li>1. Open this app in <strong>Chrome for Android</strong>.</li>
                  <li>2. Tap the browser menu (three dots) in the top right.</li>
                  <li>3. Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
                </>
              )}
            </ol>

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-6 min-h-[44px] w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 z-40 flex items-center gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-900 shadow-sm"
    >
      <WifiOff className="h-4 w-4 shrink-0 text-amber-700" />
      <span>Offline mode — local vocabulary & grammar drills remain available.</span>
    </div>
  );
};
