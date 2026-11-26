import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Briefcase,
  Coffee,
  Cpu,
  Film,
  GraduationCap,
  HeartPulse,
  Plane,
  Search,
  Sparkles,
  Utensils,
  X,
} from 'lucide-react';
import {
  CONVERSATION_THEMES,
  ConversationTheme,
  PARTNER_FIELDS,
  PERSONA_PROFILES,
  PersonaProfile,
  ThemeIconKey,
} from '../data/curriculum';
import { filterConversationThemes } from '../utils/learningLogic';

interface ThemeSelectorModalProps {
  isOpen: boolean;
  currentPersona: PersonaProfile;
  activeThemeId?: string | null;
  isSeeding: boolean;
  onClose: () => void;
  onSeedTheme: (options: {
    theme: ConversationTheme;
    customAngle: string;
    useRecommendedPartner: boolean;
  }) => Promise<void>;
}

const THEME_ICONS: Record<ThemeIconKey, React.FC<{ className?: string }>> = {
  briefcase: Briefcase,
  plane: Plane,
  coffee: Coffee,
  graduation: GraduationCap,
  cpu: Cpu,
  heart: HeartPulse,
  film: Film,
  utensils: Utensils,
};

const MODAL_CATEGORIES = ['All', ...PARTNER_FIELDS.filter((f) => f !== 'All Fields')];

export const ThemeSelectorModal: React.FC<ThemeSelectorModalProps> = ({
  isOpen,
  currentPersona,
  activeThemeId,
  isSeeding,
  onClose,
  onSeedTheme,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedTheme, setSelectedTheme] = useState<ConversationTheme>(
    () => CONVERSATION_THEMES.find((t) => t.id === activeThemeId) ?? CONVERSATION_THEMES[0]
  );
  const [customAngle, setCustomAngle] = useState('');
  const [useRecommendedPartner, setUseRecommendedPartner] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    if (activeThemeId) {
      const matched = CONVERSATION_THEMES.find((t) => t.id === activeThemeId);
      if (matched) setSelectedTheme(matched);
    }
  }, [activeThemeId, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSeeding) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isSeeding, onClose]);

  const filteredThemes = filterConversationThemes(
    CONVERSATION_THEMES,
    searchQuery,
    selectedCategory
  );

  const recommendedPartner =
    PERSONA_PROFILES.find((p) => p.id === selectedTheme.recommendedPartnerId) ?? currentPersona;
  const targetPartner = useRecommendedPartner ? recommendedPartner : currentPersona;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSeeding) return;
    await onSeedTheme({
      theme: selectedTheme,
      customAngle: customAngle.trim(),
      useRecommendedPartner,
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/55 p-0 sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSeeding) onClose();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="theme-selector-title"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-xl sm:rounded-3xl"
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
              <div>
                <p className="text-xs font-semibold text-emerald-700">
                  Conversation Theme Selector
                </p>
                <h2
                  id="theme-selector-title"
                  className="mt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl"
                >
                  Pick a Speaking Theme to Seed Your AI Starter
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={isSeeding}
                aria-label="Close theme selector"
                className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search & Category Filter */}
            <div className="space-y-3 border-b border-slate-100 bg-slate-50/70 px-5 py-3.5 sm:px-6">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <label htmlFor="theme-search-input" className="sr-only">
                  Search conversation themes
                </label>
                <input
                  id="theme-search-input"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search themes (e.g., Job Interview, Travel, Academic)..."
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter themes by category">
                {MODAL_CATEGORIES.map((category) => {
                  const active = selectedCategory === category;
                  return (
                    <button
                      key={category}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedCategory(category)}
                      className={`min-h-[36px] rounded-lg px-2.5 py-1 text-xs font-semibold transition whitespace-nowrap ${
                        active
                          ? 'bg-slate-900 text-white'
                          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {category}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Theme Cards Grid */}
            <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
              {filteredThemes.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
                  <p className="text-sm font-semibold text-slate-900">
                    No matching preset theme found
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Try clearing your search or select any theme below and add your own custom angle.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('All');
                    }}
                    className="mt-3 inline-flex min-h-[40px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    Show All Themes
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {filteredThemes.map((theme) => {
                    const Icon = THEME_ICONS[theme.icon];
                    const selected = selectedTheme.id === theme.id;
                    const themePartner = PERSONA_PROFILES.find(
                      (p) => p.id === theme.recommendedPartnerId
                    );
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setSelectedTheme(theme)}
                        className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
                          selected
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                            selected ? 'bg-white/10 text-emerald-300' : 'bg-slate-100 text-emerald-700'
                          }`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-bold leading-snug">{theme.title}</h3>
                          <p
                            className={`mt-0.5 text-[11px] font-medium ${
                              selected ? 'text-emerald-300' : 'text-slate-500'
                            }`}
                          >
                            {theme.category} · {theme.suggestedLevel}
                            {themePartner ? ` · Partner: ${themePartner.name}` : ''}
                          </p>
                          <p
                            className={`mt-1.5 text-xs leading-relaxed ${
                              selected ? 'text-slate-200' : 'text-slate-600'
                            }`}
                          >
                            {theme.tagline}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Pinned Confirmation & Customization Footer */}
            <form
              onSubmit={handleConfirm}
              className="space-y-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6"
            >
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={useRecommendedPartner}
                    onChange={(e) => setUseRecommendedPartner(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                  />
                  <span>
                    Pair with recommended partner ({recommendedPartner.name} · {recommendedPartner.voiceName})
                  </span>
                </label>
                <span className="text-xs text-slate-500">
                  Selected: <strong className="text-slate-900">{selectedTheme.title}</strong> with{' '}
                  <strong className="text-slate-900">{targetPartner.name}</strong>
                </span>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <label htmlFor="theme-custom-angle" className="sr-only">
                  Optional focus or scenario detail
                </label>
                <input
                  id="theme-custom-angle"
                  type="text"
                  value={customAngle}
                  onChange={(e) => setCustomAngle(e.target.value)}
                  disabled={isSeeding}
                  placeholder={`Focus detail for ${selectedTheme.title} (optional)...`}
                  className="min-h-[44px] flex-1 rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                />

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isSeeding}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSeeding}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60 whitespace-nowrap"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>{isSeeding ? 'Seeding starter...' : 'Start Conversation'}</span>
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
