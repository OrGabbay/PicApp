'use client';
import { useState, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { enhancePrompt, detectProvider, clearStoredApiKey } from '@/src/lib/api';
import { useCurrentUser } from '@/src/lib/useCurrentUser';
import {
  updatePreferences,
  usePreferences,
  type GalleryLayout,
  type GallerySize,
  type GallerySort,
  type Language,
  type ThemePreference,
} from '@/src/lib/preferences';
import { useI18n, LANGUAGE_NAMES, type MessageKey } from '@/src/i18n';

// Provider names are brand names, so only the "auto" option is translated
const PROVIDER_OPTIONS = [
  { id: '', label: null },
  { id: 'openai', label: '🟢 OpenAI (GPT-4o / ChatGPT)' },
  { id: 'anthropic', label: '🟣 Anthropic (Claude Opus 5.5)' },
  { id: 'gemini', label: '🔵 Google (Gemini 1.5 Flash)' },
  { id: 'groq', label: '🟠 Groq (Llama 3.3 70B)' },
  { id: 'openrouter', label: '🌐 OpenRouter (Multi-Model)' },
];

const THEME_OPTIONS: { value: ThemePreference; label: MessageKey; icon: string }[] = [
  { value: 'dark', label: 'settings.themeDark', icon: '🌙' },
  { value: 'light', label: 'settings.themeLight', icon: '☀️' },
  { value: 'system', label: 'settings.themeSystem', icon: '💻' },
];
const LANGUAGES: Language[] = ['en', 'he', 'es', 'fr'];
const SIZE_OPTIONS: { value: GallerySize; label: MessageKey }[] = [
  { value: 'small', label: 'settings.sizeSmall' },
  { value: 'medium', label: 'settings.sizeMedium' },
  { value: 'large', label: 'settings.sizeLarge' },
];
const SORT_OPTIONS: { value: GallerySort; label: MessageKey }[] = [
  { value: 'newest', label: 'settings.sortNewest' },
  { value: 'oldest', label: 'settings.sortOldest' },
];
const LAYOUT_OPTIONS: { value: GalleryLayout; label: MessageKey; hint: MessageKey; icon: string }[] = [
  { value: 'grid', label: 'settings.layoutGrid', hint: 'settings.layoutGridHint', icon: '▦' },
  { value: 'masonry', label: 'settings.layoutMasonry', hint: 'settings.layoutMasonryHint', icon: '▥' },
];

function readStoredKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('ai_user_key') || localStorage.getItem('anthropic_user_key') || '';
}

function readStoredProvider(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('ai_user_provider') || '';
}

/** Card wrapper for one settings section. */
function Section({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <section className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-6 mb-5 shadow-xl shadow-black/40">
      <h2 className="text-white font-bold text-base flex items-center gap-2 mb-5">
        <span>{icon}</span> {title}
      </h2>
      {children}
    </section>
  );
}

/** Row of mutually exclusive options (a radio group styled as buttons). */
function OptionGroup<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: { value: T; label: string; sub?: string; icon?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="mb-5 last:mb-0">
      <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">{label}</div>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={value === opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex-1 min-w-[96px] px-3 py-2.5 rounded-2xl border text-xs font-semibold transition-all ${
              value === opt.value
                ? 'border-blue-500 bg-blue-600/20 text-white shadow-md shadow-blue-900/20'
                : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700 hover:text-white'
            }`}
          >
            {opt.icon && <span className="me-1.5">{opt.icon}</span>}
            {opt.label}
            {opt.sub && <span className="block text-[10px] font-normal text-zinc-500 mt-0.5">{opt.sub}</span>}
          </button>
        ))}
      </div>
      {hint && <p className="text-[11px] text-zinc-500 mt-2">{hint}</p>}
    </div>
  );
}

export default function SettingsPage() {
  // Reading storage in the initializer is safe: the key form only renders after the
  // login check finishes in the browser, so the server never renders these values
  const [userKey, setUserKey]           = useState(readStoredKey);
  const [selectedProvider, setSelectedProvider] = useState(readStoredProvider);
  const [detectedName, setDetectedName] = useState<string | null>(null);
  const [showKey, setShowKey]           = useState(false);
  const [saved, setSaved]               = useState(false);
  const [testing, setTesting]           = useState(false);
  const [testResult, setTestResult]     = useState<{ ok: boolean; msg: string } | null>(null);
  const user = useCurrentUser();
  const prefs = usePreferences();
  const { t } = useI18n();

  const detectCompany = async (key: string) => {
    if (!key.trim()) {
      setDetectedName(null);
      return;
    }
    const res = await detectProvider(key);
    setDetectedName(res.provider !== 'unknown' ? res.name : null);
  };

  // Show which company the saved key belongs to
  useEffect(() => {
    const key = readStoredKey().trim();
    if (key) {
      detectProvider(key).then((res) => setDetectedName(res.provider !== 'unknown' ? res.name : null));
    }
  }, []);

  const handleKeyChange = (val: string) => {
    setUserKey(val);
    setSaved(false);
    setTestResult(null);
    detectCompany(val);
  };

  const handleSave = () => {
    const trimmed = userKey.trim();
    if (trimmed) {
      localStorage.setItem('ai_user_key', trimmed);
      localStorage.setItem('anthropic_user_key', trimmed); // backward compat
      if (selectedProvider) {
        localStorage.setItem('ai_user_provider', selectedProvider);
      } else {
        localStorage.removeItem('ai_user_provider');
      }
    } else {
      clearStoredApiKey();
    }
    setSaved(true);
    setTestResult(null);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleClear = () => {
    clearStoredApiKey();
    setUserKey('');
    setSelectedProvider('');
    setDetectedName(null);
    setSaved(false);
    setTestResult(null);
  };

  const handleTestKey = async () => {
    const trimmed = userKey.trim();
    if (!trimmed) {
      setTestResult({ ok: false, msg: t('settings.testNoKey') });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      localStorage.setItem('ai_user_key', trimmed);
      if (selectedProvider) {
        localStorage.setItem('ai_user_provider', selectedProvider);
      }
      const res = await enhancePrompt({
        prompt: 'A futuristic city in the clouds',
        provider: selectedProvider || undefined,
      });

      if (res.engine && res.engine !== 'Preset') {
        setTestResult({ ok: true, msg: t('settings.testSuccess', { engine: res.engine }) });
      } else {
        const reasonKey = `keyIssue.${res.error_code}` as MessageKey;
        setTestResult({
          ok: false,
          msg: res.error_code
            ? t(reasonKey, { provider: res.error_provider || 'AI' })
            : res.error || t('settings.testFailed'),
        });
      }
    } catch (err) {
      setTestResult({ ok: false, msg: err instanceof Error ? err.message : t('settings.testError') });
    } finally {
      setTesting(false);
    }
  };

  const hasKey = userKey.trim().length > 0;

  return (
    <div className="max-w-2xl mx-auto w-full px-6 py-10">
      {/* Header */}
      <div className="mb-8 pb-5 border-b border-zinc-800">
        <Link
          href="/studio"
          className="text-xs text-zinc-500 hover:text-white mb-3 inline-flex items-center gap-1 transition-colors"
        >
          {t('settings.back')}
        </Link>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">{t('settings.title')}</h1>
        <p className="text-zinc-400 text-xs mt-1">{t('settings.subtitle')}</p>
        <p className="text-zinc-500 text-[11px] mt-1">{t('settings.savedAutomatically')}</p>
      </div>

      {/* Appearance */}
      <Section icon="🎨" title={t('settings.appearance')}>
        <OptionGroup
          label={t('settings.theme')}
          value={prefs.theme}
          options={THEME_OPTIONS.map((o) => ({ value: o.value, label: t(o.label), icon: o.icon }))}
          onChange={(theme) => updatePreferences({ theme })}
        />
      </Section>

      {/* Language */}
      <Section icon="🌐" title={t('settings.language')}>
        <OptionGroup
          label={t('settings.language')}
          hint={t('settings.languageHint')}
          value={prefs.language}
          options={LANGUAGES.map((lang) => ({ value: lang, label: LANGUAGE_NAMES[lang] }))}
          onChange={(language) => updatePreferences({ language })}
        />
      </Section>

      {/* Gallery */}
      <Section icon="🖼️" title={t('settings.gallery')}>
        <OptionGroup
          label={t('settings.gallerySize')}
          value={prefs.gallerySize}
          options={SIZE_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
          onChange={(gallerySize) => updatePreferences({ gallerySize })}
        />
        <OptionGroup
          label={t('settings.gallerySort')}
          value={prefs.gallerySort}
          options={SORT_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
          onChange={(gallerySort) => updatePreferences({ gallerySort })}
        />
        <OptionGroup
          label={t('settings.galleryLayout')}
          value={prefs.galleryLayout}
          options={LAYOUT_OPTIONS.map((o) => ({ value: o.value, label: t(o.label), sub: t(o.hint), icon: o.icon }))}
          onChange={(galleryLayout) => updatePreferences({ galleryLayout })}
        />
      </Section>

      {/* AI provider key: a logged-in feature (the backend ignores keys sent by guests) */}
      <Section icon="🤖" title={t('settings.apiKeySection')}>
        {user === null ? (
          <div className="flex flex-col items-center text-center py-6">
            <div className="text-4xl mb-3">🔑</div>
            <h3 className="text-white font-bold text-sm mb-1">{t('settings.keyLoginTitle')}</h3>
            <p className="text-zinc-500 text-xs leading-relaxed mb-5 max-w-sm">{t('settings.keyLoginText')}</p>
            <div className="flex gap-3">
              <Link
                href="/login"
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs transition-colors shadow-lg shadow-blue-900/30"
              >
                {t('common.login')}
              </Link>
              <Link
                href="/register"
                className="px-6 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white font-semibold rounded-xl text-xs transition-colors"
              >
                {t('common.signup')}
              </Link>
            </div>
          </div>
        ) : user ? (
          <>
            <div className="mb-6">
              <h3 className="text-white font-semibold text-sm">{t('settings.byokTitle')}</h3>
              <p className="text-zinc-400 text-xs mt-1 leading-relaxed">{t('settings.byokText')}</p>
            </div>

            {/* API Key Input */}
            <div className="flex flex-col gap-2 mb-4">
              <div className="flex items-center justify-between">
                <label htmlFor="api-key" className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  {t('settings.apiKey')}
                </label>
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showKey ? t('settings.hideKey') : t('settings.showKey')}
                </button>
              </div>

              <input
                id="api-key"
                type={showKey ? 'text' : 'password'}
                dir="ltr"
                placeholder={t('settings.keyPlaceholder')}
                value={userKey}
                onChange={(e) => handleKeyChange(e.target.value)}
                className="bg-zinc-950 text-white text-xs px-4 py-3 rounded-2xl border border-zinc-700/80 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 w-full font-mono transition-all"
              />

              {/* Automatic Company Detection Badge */}
              {detectedName && (
                <div className="flex items-center gap-2 mt-1.5 px-3 py-1.5 rounded-xl bg-blue-950/40 border border-blue-800/40 text-blue-300 text-xs font-medium">
                  <span>🏢</span>
                  <span>{t('settings.detected')}</span>
                  <strong className="text-white">{detectedName}</strong>
                </div>
              )}
            </div>

            {/* Provider Override Dropdown */}
            <div className="flex flex-col gap-2 mb-6">
              <label htmlFor="provider-select" className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                {t('settings.providerSelection')}
              </label>
              <select
                id="provider-select"
                value={selectedProvider}
                onChange={(e) => {
                  setSelectedProvider(e.target.value);
                  setSaved(false);
                  setTestResult(null);
                }}
                className="bg-zinc-950 text-zinc-200 text-xs px-3.5 py-2.5 rounded-2xl border border-zinc-700/80 focus:outline-none focus:border-blue-500 transition-colors"
              >
                {PROVIDER_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label ?? t('settings.providerAuto')}
                  </option>
                ))}
              </select>
            </div>

            {/* Test Result Message */}
            {testResult && (
              <div
                role="status"
                className={`p-3.5 rounded-2xl text-xs mb-5 flex items-start gap-2.5 ${
                  testResult.ok
                    ? 'bg-emerald-950/40 border border-emerald-800/60 text-emerald-300'
                    : 'bg-rose-950/40 border border-rose-800/60 text-rose-300'
                }`}
              >
                <span className="text-base">{testResult.ok ? '✓' : '⚠️'}</span>
                <p className="leading-relaxed">{testResult.msg}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleSave}
                className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all duration-200 ${
                  saved
                    ? 'bg-emerald-600 text-white'
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-900/30 active:scale-[0.98]'
                }`}
              >
                {saved ? t('settings.saved') : t('settings.save')}
              </button>

              <button
                type="button"
                onClick={handleTestKey}
                disabled={testing || !hasKey}
                className="py-2.5 px-4 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              >
                {testing && (
                  <span className="w-3 h-3 border-2 border-zinc-400 border-t-white rounded-full animate-spin inline-block" />
                )}
                {testing ? t('settings.testing') : t('settings.test')}
              </button>

              {hasKey && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="py-2.5 px-4 rounded-xl text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-rose-400 border border-zinc-800 transition-colors"
                >
                  {t('settings.clear')}
                </button>
              )}
            </div>

            {/* Supported Providers Reference */}
            <div className="mt-6 pt-5 border-t border-zinc-800/80 text-xs text-zinc-400 space-y-4">
              <h3 className="text-white font-bold text-sm flex items-center gap-2">
                <span>⚡</span> {t('settings.supported')}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {[
                  { name: '🟢 OpenAI (ChatGPT)', prefix: t('settings.prefixOpenAI') },
                  { name: '🟣 Anthropic (Claude)', prefix: t('settings.prefixAnthropic') },
                  { name: '🔵 Google (Gemini)', prefix: t('settings.prefixGoogle') },
                  { name: '🟠 Groq (Llama 3.3)', prefix: t('settings.prefixGroq') },
                ].map((p) => (
                  <div key={p.name} className="bg-zinc-950/40 p-3 rounded-2xl border border-zinc-800/80">
                    <strong className="text-white block mb-0.5">{p.name}</strong>
                    <span className="text-[11px] text-zinc-500 font-mono">{p.prefix}</span>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-zinc-500 pt-1 border-t border-zinc-800/60 leading-relaxed">
                {t('settings.storageNote')}
              </p>
            </div>
          </>
        ) : null}
      </Section>
    </div>
  );
}
