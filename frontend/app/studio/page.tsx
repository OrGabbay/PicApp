'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  createGeneration,
  enhancePrompt,
  getGenerationHistory,
  toggleFavorite,
  downloadImage,
  AuthRequiredError,
  EngineBusyError,
  EngineUnavailableError,
} from '@/src/lib/api';
import { useCurrentUser } from '@/src/lib/useCurrentUser';
import { useI18n, describeKeyIssue, translateServerMessage, type MessageKey } from '@/src/i18n';
import ImageCard from '@/src/components/ImageCard';
import EngineGateDialog from '@/src/components/EngineGateDialog';
import { useStoredKeys } from '@/src/lib/keys';
import { updatePreferences, usePreferences, type ImageEngineId } from '@/src/lib/preferences';
import { ENGINES, PROVIDER_NAMES, getEngine, type EngineInfo } from '@/src/lib/engines';
import type { GenerationItem, AspectRatio, ImageStyle } from '@/src/types/api';

// Kept in English on purpose: these are sent to the image engine, which works best in English
const INSPIRATION_PROMPTS = [
  'A majestic golden eagle soaring over snow-capped mountains at sunset',
  'Cyberpunk street vendor in neon-lit futuristic Tokyo alley in the rain',
  'Cozy wooden cabin surrounded by misty autumn forest with warm glowing windows',
  'Enchanted ancient library with spiraling bookshelves and floating glowing orbs',
  'Futuristic crystalline supercar parked on a beach under a galaxy night sky',
  'Whimsical watercolor illustration of a red fox wearing a scarf in snow',
];

const STYLES: { label: ImageStyle; icon: string }[] = [
  { label: 'Cinematic', icon: '🎬' },
  { label: 'Photorealistic', icon: '📸' },
  { label: 'Anime', icon: '🎌' },
  { label: 'Cyberpunk', icon: '🌆' },
  { label: 'Fantasy', icon: '🧙' },
  { label: '3D Render', icon: '🎨' },
  { label: 'Watercolor', icon: '🖌️' },
  { label: 'Minimalist', icon: '⚪' },
];

const ASPECT_RATIOS: { value: AspectRatio; label: MessageKey; sub: string; iconW: number; iconH: number }[] = [
  { value: '1:1',  label: 'aspect.square',    sub: '1024×1024', iconW: 16, iconH: 16 },
  { value: '16:9', label: 'aspect.landscape', sub: '1920×1080', iconW: 22, iconH: 13 },
  { value: '9:16', label: 'aspect.portrait',  sub: '576×1024',  iconW: 13, iconH: 22 },
  { value: '4:3',  label: 'aspect.classic',   sub: '1024×768',  iconW: 18, iconH: 14 },
];

const GENERATION_STEPS: MessageKey[] = ['studio.step1', 'studio.step2', 'studio.step3', 'studio.step4'];

// Only called from event handlers and timers, never while rendering
const clockNow = () => Date.now();

export default function StudioPage() {
  const [prompt, setPrompt]                   = useState('');
  const [aspectRatio, setAspectRatio]         = useState<AspectRatio>('1:1');
  const [selectedStyle, setSelectedStyle]     = useState<ImageStyle | null>('Cinematic');
  const [isGenerating, setIsGenerating]       = useState(false);
  const [isEnhancing, setIsEnhancing]         = useState(false);
  const [generationStep, setGenerationStep]   = useState(0);
  const [currentImage, setCurrentImage]       = useState<GenerationItem | null>(null);
  const [imageLoaded, setImageLoaded]         = useState(false);
  const [history, setHistory]                 = useState<GenerationItem[]>([]);
  const [error, setError]                     = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt]       = useState(false);
  const [keyWarning, setKeyWarning]           = useState<string | null>(null);
  // When the free engine accepts a new image again (it allows about one per 45 s)
  const [engineReadyAt, setEngineReadyAt]     = useState<number | null>(null);
  // Only meaningful while waiting; set from the busy response (reading the clock during
  // render is flagged by Cache Components)
  const [now, setNow]                         = useState(0);
  // Engine waiting for the user to log in / connect its key (shown in a popup)
  const [gateEngine, setGateEngine]           = useState<EngineInfo | null>(null);
  const user = useCurrentUser();
  const { t, rich, language } = useI18n();
  const storedKeys = useStoredKeys();
  const engine = getEngine(usePreferences().engine);

  /** Paid engines need a login (keys are a logged-in feature) and that provider's key. */
  const isLocked = (e: EngineInfo) => e.provider !== null && (!user || !storedKeys.keys[e.provider]);

  /** Dropdown text: name, Free/Paid (with price), and what's missing if it's locked. */
  const engineOptionLabel = (e: EngineInfo) => {
    const cost = e.tier === 'free'
      ? t('studio.labelFree')
      : `${t('studio.labelPaid')}${e.price ? ` · ${t('studio.perImage', { price: e.price })}` : ''}`;
    const missing = isLocked(e) && e.provider
      ? ` · ${t(e.tier === 'free' ? 'studio.needsFreeAccount' : 'studio.engineNeedsKey', { provider: PROVIDER_NAMES[e.provider] })}`
      : '';
    return `${isLocked(e) ? '🔒 ' : ''}${e.name} — ${cost}${missing}`;
  };

  const selectEngine = (id: string) => {
    const next = getEngine(id);
    if (isLocked(next)) {
      setGateEngine(next);
      return;
    }
    updatePreferences({ engine: next.id as ImageEngineId });
  };

  // Recent generations come from the user's gallery, so they only exist when logged in
  useEffect(() => {
    if (!user) return;
    getGenerationHistory(1, 12)
      .then((data) => {
        setHistory(data.items);
        if (data.items.length > 0) {
          setCurrentImage((current) => current ?? data.items[0]);
          setImageLoaded(true);
        }
      })
      .catch(() => {});
  }, [user]);

  // Cycle animated loading status steps while generating
  useEffect(() => {
    if (!isGenerating) return;
    const interval = setInterval(() => {
      setGenerationStep((prev) => (prev + 1) % GENERATION_STEPS.length);
    }, 2800);
    return () => clearInterval(interval);
  }, [isGenerating]);

  // Tick once a second while waiting for the free engine, then clear the wait
  useEffect(() => {
    if (engineReadyAt === null) return;
    const interval = setInterval(() => {
      const current = clockNow();
      setNow(current);
      if (current >= engineReadyAt) setEngineReadyAt(null);
    }, 1000);
    return () => clearInterval(interval);
  }, [engineReadyAt]);

  const engineWait = engineReadyAt === null ? 0 : Math.max(0, Math.ceil((engineReadyAt - now) / 1000));

  const handleEnhance = async () => {
    if (!prompt.trim() || isEnhancing || isGenerating) return;
    setIsEnhancing(true);
    setError(null);
    try {
      const result = await enhancePrompt({
        prompt,
        style: selectedStyle || undefined,
      });
      setPrompt(result.enhanced_prompt);
      if (result.error) {
        setKeyWarning(describeKeyIssue(
          language,
          { code: result.error_code, provider: result.error_provider, message: result.error },
          'enhance',
        ));
      }
    } catch (err) {
      setError(err instanceof Error ? translateServerMessage(language, err.message) : t('studio.enhanceFailed'));
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating || (engine.id === 'free' && engineWait > 0)) return;
    if (isLocked(engine)) {
      setGateEngine(engine);
      return;
    }

    setIsGenerating(true);
    setGenerationStep(0);
    setImageLoaded(false);
    setError(null);

    try {
      const newImage = await createGeneration({
        engine: engine.id,
        prompt,
        aspect_ratio: aspectRatio,
        style: selectedStyle || undefined,
      });
      setCurrentImage(newImage);
      if (newImage.key_warning) {
        setKeyWarning(describeKeyIssue(
          language,
          {
            code: newImage.key_warning_code,
            provider: newImage.key_warning_provider,
            fallback: newImage.key_warning_fallback,
            message: newImage.key_warning,
          },
          'generate',
        ));
      }
      if (newImage.saved !== false) {
        setHistory((prev) => [newImage, ...prev.filter((i) => i.id !== newImage.id).slice(0, 11)]);
      }
    } catch (err) {
      // Generation failed, so show the previous image again
      if (currentImage) setImageLoaded(true);
      // The chosen engine's key failed and the free fallback couldn't help either: say why
      if ((err instanceof EngineBusyError || err instanceof EngineUnavailableError) && err.keyIssue) {
        setKeyWarning(describeKeyIssue(language, err.keyIssue, 'reason'));
      }
      if (err instanceof EngineBusyError) {
        const current = clockNow();
        setNow(current);
        setEngineReadyAt(current + err.retryAfter * 1000);
      } else if (err instanceof EngineUnavailableError) {
        setError(t('studio.engineUnavailable'));
      } else if (err instanceof AuthRequiredError) {
        setError(t('studio.sessionExpired'));
      } else {
        setError(err instanceof Error ? translateServerMessage(language, err.message) : t('studio.generationFailed'));
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleToggleFav = async (img: GenerationItem) => {
    if (img.id === null) return;
    try {
      const res = await toggleFavorite(img.id);
      const updated = { ...img, is_favorite: res.is_favorite };
      if (currentImage?.id === img.id) {
        setCurrentImage(updated);
      }
      setHistory((prev) =>
        prev.map((item) => (item.id === img.id ? updated : item))
      );
    } catch {}
  };

  const handleCopyPrompt = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleGenerate();
    }
  };

  return (
    <div className="max-w-7xl mx-auto w-full px-6 py-8 md:px-8">
      {/* ── Studio Header & Engine Status ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">{t('studio.title')}</h1>
          <p className="text-zinc-400 text-sm mt-1">{t('studio.subtitle')}</p>
        </div>

        <Link
          href="/settings"
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            engine.id !== 'free'
              ? 'bg-blue-950/40 border-blue-700/50 text-blue-300 hover:bg-blue-900/40'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          {engine.id !== 'free' ? t('studio.engineActive', { engine: engine.name }) : t('studio.freeMode')}
        </Link>
      </div>

      {/* ── Two Column Studio Layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-14">

        {/* ─ LEFT COLUMN: Generation Controls (5 cols) ─ */}
        <div className="lg:col-span-5 flex flex-col gap-5">

          {/* Prompt Input Box */}
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5 shadow-lg shadow-black/40 flex flex-col gap-3 focus-within:border-zinc-700 transition-all">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                {t('studio.promptLabel')}
              </label>
              <button
                type="button"
                onClick={handleEnhance}
                disabled={!prompt.trim() || isEnhancing || isGenerating}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg bg-violet-600/20 text-violet-300 border border-violet-500/30 hover:bg-violet-600/30 hover:border-violet-500/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isEnhancing ? (
                  <span className="w-3 h-3 border-2 border-violet-300 border-t-transparent rounded-full animate-spin inline-block" />
                ) : (
                  <span>✨</span>
                )}
                {isEnhancing ? t('studio.enhancing') : t('studio.enhance')}
              </button>
            </div>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('studio.placeholder')}
              rows={4}
              className="w-full bg-transparent text-white placeholder:text-zinc-600 focus:outline-none resize-none text-sm leading-relaxed"
            />

            <div className="flex items-center justify-between border-t border-zinc-800/80 pt-3 text-xs text-zinc-500">
              <span>{t('studio.characters', { count: prompt.length })}</span>
              <span className="hidden sm:inline">
                {rich('studio.shortcut', {
                  key: <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono text-[10px]" dir="ltr">Ctrl+Enter</kbd>,
                })}
              </span>
            </div>
          </div>

          {/* Prompt Inspiration Chips */}
          <div>
            <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              {t('studio.inspiration')}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {INSPIRATION_PROMPTS.map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => setPrompt(sample)}
                  dir="ltr"
                  className="text-start text-xs bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white px-3 py-1.5 rounded-xl border border-zinc-800/80 hover:border-zinc-700 transition-colors line-clamp-1"
                >
                  {sample}
                </button>
              ))}
            </div>
          </div>

          {/* Style Selector */}
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                {t('studio.artStyle')}
              </label>
              {selectedStyle && (
                <button
                  onClick={() => setSelectedStyle(null)}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {t('studio.clearStyle')}
                </button>
              )}
            </div>

            <div className="grid grid-cols-4 gap-2">
              {STYLES.map(({ label, icon }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setSelectedStyle(selectedStyle === label ? null : label)}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border text-xs font-medium transition-all ${
                    selectedStyle === label
                      ? 'border-blue-500 bg-blue-600/20 text-white shadow-md shadow-blue-900/20'
                      : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700 hover:text-white'
                  }`}
                >
                  <span className="text-lg mb-1">{icon}</span>
                  <span className="text-[11px] truncate w-full text-center">{t(`style.${label}` as MessageKey)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Aspect Ratio Selector */}
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 block">
              {t('studio.aspectRatio')}
            </label>
            <div className="grid grid-cols-4 gap-2">
              {ASPECT_RATIOS.map(({ value, label, iconW, iconH }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAspectRatio(value)}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border transition-all ${
                    aspectRatio === value
                      ? 'border-blue-500 bg-blue-600/20 text-white'
                      : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700 hover:text-white'
                  }`}
                >
                  <div className="h-6 flex items-center justify-center mb-1">
                    <div
                      className={`border-2 rounded-sm ${
                        aspectRatio === value ? 'border-blue-400' : 'border-zinc-600'
                      }`}
                      style={{ width: `${iconW}px`, height: `${iconH}px` }}
                    />
                  </div>
                  <span className="text-xs font-semibold">{value}</span>
                  <span className="text-[10px] text-zinc-500">{t(label)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Image engine picker */}
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5">
            <label htmlFor="engine-select" className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 block">
              {t('studio.engineLabel')}
            </label>
            <select
              id="engine-select"
              value={engine.id}
              onChange={(e) => selectEngine(e.target.value)}
              aria-describedby="engine-hint"
              className="w-full bg-zinc-950 text-white text-sm px-3.5 py-2.5 rounded-2xl border border-zinc-700/80 focus:outline-none focus:border-blue-500 transition-colors"
            >
              {(['free', 'paid'] as const).map((tier) => (
                <optgroup key={tier} label={tier === 'free' ? t('studio.engineGroupFree') : t('studio.engineGroupPaid')}>
                  {ENGINES.filter((e) => e.tier === tier).map((e) => (
                    <option key={e.id} value={e.id}>
                      {engineOptionLabel(e)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p id="engine-hint" className="text-[11px] text-zinc-500 mt-2 leading-relaxed">
              <span
                className={`inline-block me-1.5 px-1.5 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wide align-middle ${
                  engine.tier === 'free'
                    ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                    : 'bg-amber-600/20 border-amber-500/40 text-amber-300'
                }`}
              >
                {engine.tier === 'free' ? t('studio.labelFree') : t('studio.labelPaid')}
              </span>
              {t(engine.description)}
              {engine.provider && (
                <>
                  {' · '}
                  {engine.price
                    ? t('studio.engineCost', { price: engine.price, provider: PROVIDER_NAMES[engine.provider] })
                    : t('studio.engineFreeWith', { provider: PROVIDER_NAMES[engine.provider] })}
                </>
              )}
            </p>
          </div>

          {/* Guest notice: generating works, but nothing is saved */}
          {user === null && (
            <div className="flex items-start gap-3 bg-amber-950/30 border border-amber-800/50 rounded-2xl p-4">
              <span className="text-amber-400 text-lg">🔒</span>
              <p className="text-xs text-amber-200/90 leading-relaxed">
                {rich('studio.guestNotice', {
                  login: (
                    <Link href="/login" className="font-semibold text-amber-300 underline hover:text-amber-200">
                      {t('studio.guestLogin')}
                    </Link>
                  ),
                  signup: (
                    <Link href="/register" className="font-semibold text-amber-300 underline hover:text-amber-200">
                      {t('studio.guestSignup')}
                    </Link>
                  ),
                })}
              </p>
            </div>
          )}

          {/* Free engine busy: countdown until the next image is possible */}
          {engineWait > 0 && (
            <div role="status" className="flex items-start gap-3 bg-blue-950/40 border border-blue-800/60 rounded-2xl p-4">
              <span className="text-blue-400 text-lg">⏳</span>
              <p className="text-xs text-blue-200 leading-relaxed">{t('studio.engineBusy', { seconds: engineWait })}</p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-3 bg-rose-950/40 border border-rose-800/60 rounded-2xl p-4">
              <span className="text-rose-400 text-lg">⚠️</span>
              <p className="text-xs text-rose-300 leading-relaxed">{error}</p>
            </div>
          )}

          {/* Generate Button */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim() || (engine.id === 'free' && engineWait > 0)}
            className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-3 text-base shadow-xl transition-all duration-200 ${
              isGenerating || !prompt.trim() || (engine.id === 'free' && engineWait > 0)
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-900/30 active:scale-[0.98]'
            }`}
          >
            {isGenerating ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>{t('studio.creating')}</span>
              </>
            ) : (
              <>
                <span>{engine.id === 'free' && engineWait > 0 ? t('studio.engineReadyIn', { seconds: engineWait }) : t('studio.generate')}</span>
              </>
            )}
          </button>
        </div>

        {/* ─ RIGHT COLUMN: Canvas & Viewer (7 cols) ─ */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl overflow-hidden min-h-[460px] flex flex-col items-center justify-center relative p-3 shadow-2xl shadow-black/80">
            {isGenerating ? (
              /* Generating status display */
              <div className="flex flex-col items-center gap-6 p-10 text-center max-w-sm">
                <div className="relative w-24 h-24">
                  <div className="absolute inset-0 rounded-full border-4 border-zinc-800 border-t-blue-500 animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center text-3xl animate-pulse">
                    ✨
                  </div>
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg mb-1">{t('studio.generatingTitle')}</h3>
                  <p className="text-blue-400 text-xs font-medium animate-pulse min-h-[20px]">
                    {t(GENERATION_STEPS[generationStep])}
                  </p>
                </div>
                <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full w-2/3 animate-pulse rounded-full" />
                </div>
              </div>
            ) : currentImage ? (
              /* Display Current Image */
              <div className="w-full h-full flex flex-col items-center justify-center relative">
                {!imageLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 rounded-2xl z-10">
                    <div className="w-10 h-10 border-3 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
                  </div>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={currentImage.image_url}
                  alt={currentImage.original_prompt}
                  className={`w-full max-h-[600px] object-contain rounded-2xl transition-opacity duration-500 ${
                    imageLoaded ? 'opacity-100' : 'opacity-0'
                  }`}
                  onLoad={() => setImageLoaded(true)}
                />
              </div>
            ) : (
              /* Empty state */
              <div className="flex flex-col items-center gap-4 p-12 text-center max-w-md">
                <div className="w-20 h-20 rounded-3xl bg-zinc-800/60 border border-zinc-700/50 flex items-center justify-center text-4xl shadow-inner">
                  🖼️
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg">{t('studio.canvasTitle')}</h3>
                  <p className="text-zinc-500 text-sm mt-1 leading-relaxed">
                    {t('studio.canvasText')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Action Toolbar & Prompt Metadata */}
          {currentImage && (
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5 space-y-4">
              {/* Quick Actions Row */}
              <div className="flex flex-wrap gap-2 pb-3 border-b border-zinc-800/80">
                <button
                  type="button"
                  onClick={() => downloadImage(currentImage.image_url, `picapp-${currentImage.id ?? 'guest'}.jpg`)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors"
                >
                  <span>💾</span> {t('studio.download')}
                </button>

                {currentImage.id === null ? (
                  <span className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium border border-amber-800/50 bg-amber-950/30 text-amber-300">
                    <span>🔒</span> {t('studio.notSaved')}
                  </span>
                ) : (
                <button
                  type="button"
                  onClick={() => handleToggleFav(currentImage)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                    currentImage.is_favorite
                      ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                      : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300'
                  }`}
                >
                  <span>{currentImage.is_favorite ? '❤️' : '🤍'}</span>
                  {currentImage.is_favorite ? t('studio.favorited') : t('studio.favorite')}
                </button>
                )}

                <button
                  type="button"
                  onClick={() => handleCopyPrompt(currentImage.original_prompt)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium transition-colors"
                >
                  <span>{copiedPrompt ? '✓' : '📋'}</span>
                  {copiedPrompt ? t('studio.copied') : t('studio.copyPrompt')}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPrompt(currentImage.original_prompt);
                    handleGenerate();
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium transition-colors"
                >
                  <span>🔄</span> {t('studio.regenerate')}
                </button>

                <a
                  href={currentImage.image_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium transition-colors ms-auto"
                >
                  <span>🔗</span> {t('studio.fullSize')}
                </a>
              </div>

              {/* Prompt Info */}
              <div className="space-y-2">
                {currentImage.engine && (
                  <div className="flex items-center gap-2 pb-1">
                    <span className="px-2.5 py-1 rounded-lg bg-blue-950/50 border border-blue-800/40 text-blue-300 text-[11px] font-semibold">
                      {t('studio.generatedWith', { engine: currentImage.engine })}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">
                    {t('studio.originalPrompt')}
                  </span>
                  <p className="text-zinc-200 text-sm leading-relaxed">{currentImage.original_prompt}</p>
                </div>

                {currentImage.enhanced_prompt && (
                  <div className="pt-2">
                    <span className="text-[10px] font-bold text-violet-400 uppercase tracking-widest block mb-1">
                      {t('studio.enhancedPrompt')}
                    </span>
                    <p className="text-zinc-400 text-xs leading-relaxed font-mono bg-zinc-950/60 p-3 rounded-xl border border-zinc-800">
                      {currentImage.enhanced_prompt}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Generations Section ── */}
      {history.length > 0 && (
        <section className="border-t border-zinc-800/80 pt-10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">{t('studio.recentTitle')}</h2>
              <p className="text-xs text-zinc-500 mt-0.5">{t('studio.recentHint')}</p>
            </div>
            <Link
              href="/gallery"
              className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors"
            >
              {t('studio.viewFullGallery', { count: history.length })}
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {history.map((item) => (
              <ImageCard
                key={item.id}
                image={item}
                onClick={(selected) => {
                  setCurrentImage(selected);
                  setImageLoaded(false);
                  window.scrollTo({ top: 120, behavior: 'smooth' });
                }}
                onFavoriteToggle={handleToggleFav}
              />
            ))}
          </div>
        </section>
      )}

      <EngineGateDialog engine={gateEngine} loggedIn={!!user} onClose={() => setGateEngine(null)} />

      {/* API Key Warning Popup */}
      {keyWarning && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setKeyWarning(null)}
        >
          <div
            role="alertdialog"
            aria-labelledby="key-warning-title"
            className="w-full max-w-md bg-zinc-950 border border-amber-700/60 rounded-3xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <span className="text-2xl">🔑</span>
              <div>
                <h2 id="key-warning-title" className="text-base font-bold text-amber-300">
                  {t('keyPopup.title')}
                </h2>
                <p className="text-sm text-zinc-300 leading-relaxed mt-2">{keyWarning}</p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Link
                href="/settings"
                className="px-4 py-2 rounded-xl text-sm font-semibold border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-all"
              >
                {t('keyPopup.update')}
              </Link>
              <button
                type="button"
                onClick={() => setKeyWarning(null)}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-amber-600 hover:bg-amber-500 text-white transition-all"
              >
                {t('common.ok')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}