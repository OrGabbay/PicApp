'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { enhancePrompt } from '@/src/lib/api';
import {
  ENHANCER_PROVIDERS,
  guessProvider,
  setEnhancer,
  setProviderKey,
  useStoredKeys,
  type KeyProvider,
} from '@/src/lib/keys';
import { FREE_PROVIDERS, PROVIDER_KEY_URLS, PROVIDER_NAMES } from '@/src/lib/engines';
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

// Provider cards: free accounts first, then paid image engines, then prompt-only providers.
// `images` / `prompts` say what each key is used for.
const KEY_PROVIDERS: { provider: KeyProvider; images: boolean; prompts: boolean }[] = [
  { provider: 'pollinations', images: true, prompts: false },
  { provider: 'cloudflare', images: true, prompts: false },
  { provider: 'openai', images: true, prompts: true },
  { provider: 'google', images: true, prompts: true },
  { provider: 'bfl', images: true, prompts: false },
  { provider: 'anthropic', images: false, prompts: true },
  { provider: 'groq', images: false, prompts: true },
];

/** One provider's key: connect, update, test (text providers) and disconnect. */
function ProviderKeyCard({
  provider,
  images,
  prompts,
  savedKey,
}: {
  provider: KeyProvider;
  images: boolean;
  prompts: boolean;
  savedKey?: string;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');
  // Cloudflare keys are two values; they're stored together as "ACCOUNT_ID:API_TOKEN"
  const [accountId, setAccountId] = useState('');
  const twoPart = provider === 'cloudflare';
  const free = FREE_PROVIDERS.includes(provider);
  const [show, setShow] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const name = PROVIDER_NAMES[provider];
  const guessed = draft.trim() ? guessProvider(draft) : null;
  // BFL and Cloudflare keys have no prefix, so any recognizable prefix means it's another company's key
  const looksWrong =
    draft.trim() !== '' && (provider === 'bfl' || twoPart ? guessed !== null : guessed !== provider);
  const uses = [images && t(free ? 'settings.useFreeImages' : 'settings.useImages'), prompts && t('settings.usePrompts')]
    .filter(Boolean)
    .join(' · ');
  const canSave = draft.trim() !== '' && (!twoPart || accountId.trim() !== '');

  const save = () => {
    setProviderKey(provider, twoPart ? `${accountId.trim()}:${draft.trim()}` : draft);
    setDraft('');
    setAccountId('');
    setTestResult(null);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  const disconnect = () => {
    setProviderKey(provider, '');
    setTestResult(null);
  };

  // Tests the saved key with a tiny prompt-enhancement request (cheap; image models would cost more)
  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await enhancePrompt({ prompt: 'A futuristic city in the clouds' }, provider);
      if (res.engine && res.engine !== 'Preset') {
        setTestResult({ ok: true, msg: t('settings.testSuccess', { engine: res.engine }) });
      } else {
        setTestResult({
          ok: false,
          msg: res.error_code
            ? t(`keyIssue.${res.error_code}` as MessageKey, { provider: res.error_provider || name })
            : res.error || t('settings.testFailed'),
        });
      }
    } catch (err) {
      setTestResult({ ok: false, msg: err instanceof Error ? err.message : t('settings.testError') });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div
      id={`key-${provider}`}
      className="scroll-mt-24 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 transition-shadow data-[highlight=true]:border-blue-500 data-[highlight=true]:ring-2 data-[highlight=true]:ring-blue-500/40"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          {t('settings.keyFor', { provider: name })}
          <span
            className={`px-1.5 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wide ${
              free
                ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                : 'bg-amber-600/20 border-amber-500/40 text-amber-300'
            }`}
          >
            {free ? t('settings.freeBadge') : t('settings.paidBadge')}
          </span>
        </h3>
        <span className={`text-[11px] font-semibold ${savedKey ? 'text-emerald-400' : 'text-zinc-500'}`}>
          {savedKey ? `${t('settings.connected')} · …${savedKey.slice(-4)}` : t('settings.notConnected')}
        </span>
      </div>
      <p className="text-[11px] text-zinc-500 mb-3">
        {t('settings.usedFor', { uses })} ·{' '}
        <a href={PROVIDER_KEY_URLS[provider]} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
          {t('settings.getKey')}
        </a>
      </p>

      {twoPart && (
        <input
          type="text"
          dir="ltr"
          autoComplete="off"
          spellCheck={false}
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          aria-label={t('settings.cfAccountId')}
          placeholder={t('settings.cfAccountId')}
          className="w-full mb-2 bg-zinc-950 text-white text-xs px-3.5 py-2.5 rounded-xl border border-zinc-700/80 focus:outline-none focus:border-blue-500 font-mono"
        />
      )}
      <div className="flex gap-2">
        <input
          type={show ? 'text' : 'password'}
          dir="ltr"
          autoComplete="off"
          spellCheck={false}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={twoPart ? t('settings.cfToken') : t('settings.keyFor', { provider: name })}
          placeholder={savedKey ? '••••••••' + savedKey.slice(-4) : twoPart ? t('settings.cfToken') : ''}
          className="flex-1 min-w-0 bg-zinc-950 text-white text-xs px-3.5 py-2.5 rounded-xl border border-zinc-700/80 focus:outline-none focus:border-blue-500 font-mono"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="px-2.5 text-[11px] text-zinc-500 hover:text-zinc-300"
        >
          {show ? t('settings.hideKey') : t('settings.showKey')}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-40 ${
            justSaved ? 'bg-emerald-600 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'
          }`}
        >
          {justSaved ? t('settings.savedKey') : savedKey ? t('settings.update') : t('settings.connect')}
        </button>
      </div>
      {looksWrong && <p className="text-[11px] text-amber-400 mt-2">⚠️ {t('settings.wrongProvider', { provider: name })}</p>}

      {savedKey && (
        <div className="flex flex-wrap gap-2 mt-3">
          {prompts && (
            <button
              type="button"
              onClick={test}
              disabled={testing}
              className="px-3 py-1.5 rounded-xl text-[11px] font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 disabled:opacity-40 flex items-center gap-1.5"
            >
              {testing && <span className="w-3 h-3 border-2 border-zinc-400 border-t-white rounded-full animate-spin" />}
              {testing ? t('settings.testing') : t('settings.test')}
            </button>
          )}
          <button
            type="button"
            onClick={disconnect}
            className="px-3 py-1.5 rounded-xl text-[11px] font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-rose-400 border border-zinc-800"
          >
            {t('settings.disconnect')}
          </button>
        </div>
      )}

      {testResult && (
        <p role="status" className={`text-[11px] mt-2 ${testResult.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
          {testResult.ok ? '✓' : '⚠️'} {testResult.msg}
        </p>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const user = useCurrentUser();
  const prefs = usePreferences();
  const storedKeys = useStoredKeys();
  const { t } = useI18n();
  const connectedEnhancers = ENHANCER_PROVIDERS.filter((p) => storedKeys.keys[p]);

  // Links like /settings#key-google (from the Studio's engine popup) point at a card that only
  // renders after the login check, so scroll to and highlight it once it exists
  useEffect(() => {
    if (!user || !window.location.hash.startsWith('#key-')) return;
    const card = document.getElementById(window.location.hash.slice(1));
    card?.scrollIntoView({ block: 'center' });
    card?.setAttribute('data-highlight', 'true');
    card?.querySelector('input')?.focus({ preventScroll: true });
  }, [user]);

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

      {/* AI provider keys: a logged-in feature (the backend ignores keys sent by guests) */}
      <Section icon="🔑" title={t('settings.apiKeySection')}>
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
            <p className="text-zinc-400 text-xs leading-relaxed mb-5">{t('settings.keysIntro')}</p>
            <div className="flex flex-col gap-3 mb-6">
              {KEY_PROVIDERS.map((p) => (
                <ProviderKeyCard key={p.provider} {...p} savedKey={storedKeys.keys[p.provider]} />
              ))}
            </div>

            <OptionGroup
              label={t('settings.enhancerTitle')}
              hint={t('settings.enhancerHint')}
              value={storedKeys.enhancer}
              options={[
                { value: 'auto' as const, label: t('settings.enhancerAuto') },
                ...connectedEnhancers.map((p) => ({ value: p, label: PROVIDER_NAMES[p] })),
              ]}
              onChange={(enhancer) => setEnhancer(enhancer)}
            />

            <p className="text-[11px] text-zinc-500 pt-4 mt-4 border-t border-zinc-800/60 leading-relaxed">
              {t('settings.storageNote')}
            </p>
          </>
        ) : null}
      </Section>
    </div>
  );
}
