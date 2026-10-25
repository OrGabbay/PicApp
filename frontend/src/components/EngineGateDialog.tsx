'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useI18n } from '@/src/i18n';
import { PROVIDER_NAMES, type EngineInfo } from '@/src/lib/engines';

interface EngineGateDialogProps {
  engine: EngineInfo | null;
  /** Guests are asked to log in; logged-in users to connect the engine's key */
  loggedIn: boolean;
  onClose: () => void;
}

/** Explains what an engine needs before it can be used, with a way to set it up. */
export default function EngineGateDialog({ engine, loggedIn, onClose }: EngineGateDialogProps) {
  const { t } = useI18n();
  const primaryRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!engine) return;
    primaryRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine, onClose]);

  if (!engine?.provider) return null;
  const vars = { engine: engine.name, provider: PROVIDER_NAMES[engine.provider] };
  const free = engine.tier === 'free';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gate-title"
        aria-describedby="gate-text"
        className="w-full max-w-md bg-zinc-950 border border-blue-800/50 rounded-3xl p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-5">
          <span className="text-2xl">{loggedIn ? '🔑' : '🔒'}</span>
          <div>
            <h2 id="gate-title" className="text-base font-bold text-white">
              {!loggedIn ? t('gate.loginTitle', vars) : free ? t('gate.freeTitle', vars) : t('gate.connectTitle', vars)}
            </h2>
            <p id="gate-text" className="text-sm text-zinc-400 leading-relaxed mt-2">
              {!loggedIn
                ? t(free ? 'gate.freeLoginText' : 'gate.loginText', vars)
                : t(free ? 'gate.freeText' : 'gate.connectText', vars)}
            </p>
            {engine.price && (
              <p className="text-xs text-zinc-500 mt-2">{t('studio.engineCost', { price: engine.price, provider: vars.provider })}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-all"
          >
            {t('gate.notNow')}
          </button>
          {loggedIn ? (
            // A full page load (not <Link>) so the browser jumps to and highlights the provider's card
            <a
              ref={primaryRef}
              href={`/settings#key-${engine.provider}`}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-all"
            >
              {t('gate.goToSettings')}
            </a>
          ) : (
            <>
              <Link
                href="/register"
                className="px-4 py-2 rounded-xl text-sm font-semibold border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-all"
              >
                {t('common.signup')}
              </Link>
              <Link
                ref={primaryRef}
                href="/login"
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-all"
              >
                {t('common.login')}
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
