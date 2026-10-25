'use client';
// frontend/app/page.tsx
import Link from 'next/link';
import ShowcaseCarousel, { type ShowcaseSlide } from '@/src/components/ShowcaseCarousel';
import { useI18n, type MessageKey } from '@/src/i18n';

const FEATURES: { icon: string; title: MessageKey; desc: MessageKey }[] = [
  { icon: '✨', title: 'home.feature1Title', desc: 'home.feature1Desc' },
  { icon: '⚡', title: 'home.feature2Title', desc: 'home.feature2Desc' },
  { icon: '🔒', title: 'home.feature3Title', desc: 'home.feature3Desc' },
];

// Images created with PicApp, stored in public/showcase so the landing page never depends
// on the database or on Pollinations re-rendering them. Prompts are shown as written.
const SHOWCASE: { src: string; label: MessageKey; prompt: string }[] = [
  { src: '/showcase/golden-eagle.jpg', label: 'showcase.goldenEagle', prompt: 'A majestic golden eagle soaring over snow-capped mountains at sunset' },
  { src: '/showcase/watercolor-butterfly.jpg', label: 'showcase.butterfly', prompt: 'A hand-drawn butterfly' },
  { src: '/showcase/night-dragon.jpg', label: 'showcase.dragon', prompt: 'A crystal dragon flying over neon mountains' },
  { src: '/showcase/zen-garden.jpg', label: 'showcase.zenGarden', prompt: 'A peaceful zen garden with bonsai trees and stepping stones' },
  { src: '/showcase/samurai-dusk.jpg', label: 'showcase.samurai', prompt: 'A duel at dusk between a seasoned samurai and a medieval knight' },
  { src: '/showcase/ancient-library.jpg', label: 'showcase.library', prompt: 'An ancient library with floating books and magical glowing lights' },
  { src: '/showcase/soaring-owl.jpg', label: 'showcase.owl', prompt: 'A flying owl' },
];

export default function HomePage() {
  const { t } = useI18n();
  const slides: ShowcaseSlide[] = SHOWCASE.map((s) => ({ ...s, label: t(s.label) }));

  return (
    <div className="flex flex-col">
      {/* ── Hero ── */}
      <section className="relative flex flex-col items-center justify-center text-center px-6 py-28 overflow-hidden">
        {/* Subtle radial glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-950/30 via-transparent to-transparent pointer-events-none" />

        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-950/50 border border-blue-800/40 text-blue-400 text-sm mb-8">
            <span>✨</span>
            <span>{t('home.badge')}</span>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-white tracking-tight leading-[1.1] mb-6">
            {t('home.titleStart')}{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-400">
              {t('home.titleHighlight')}
            </span>
          </h1>

          <p className="text-zinc-400 text-lg leading-relaxed mb-10">
            {t('home.subtitle')}
          </p>

          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/studio"
              className="px-7 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-blue-900/40 active:scale-[0.98] text-base"
            >
              {t('home.openStudio')}
            </Link>
            <Link
              href="/gallery"
              className="px-7 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-xl transition-colors text-base"
            >
              {t('home.viewGallery')}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Showcase Carousel ── */}
      <section className="pb-20 max-w-7xl mx-auto w-full">
        <div className="text-center px-6 mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400/80">
            {t('home.madeWith')}
          </h2>
        </div>
        <ShowcaseCarousel slides={slides} label={t('home.carouselLabel')} />
      </section>

      {/* ── Features ── */}
      <section className="px-6 pb-24 max-w-5xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {FEATURES.map(({ icon, title, desc }) => (
            <div
              key={title}
              className="group bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 transition-all duration-300 ease-out hover:scale-105 hover:-translate-y-1 hover:bg-zinc-900 hover:border-blue-500/40 hover:shadow-xl hover:shadow-blue-500/15"
            >
              <div className="text-3xl mb-4 transition-transform duration-300 group-hover:scale-110">{icon}</div>
              <h3 className="text-white font-semibold mb-2">{t(title)}</h3>
              <p className="text-zinc-500 text-sm leading-relaxed transition-colors duration-300 group-hover:text-zinc-300">{t(desc)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
