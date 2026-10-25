import type { CSSProperties } from 'react';

export interface ShowcaseSlide {
  src: string;
  label: string;
  prompt: string;
}

/**
 * Slowly spinning 3D ring of images (pure CSS, see `.showcase-*` in globals.css).
 * The spin pauses on hover/focus and is disabled for users who prefer reduced motion.
 */
export default function ShowcaseCarousel({ slides, label }: { slides: ShowcaseSlide[]; label: string }) {
  return (
    <div className="showcase-stage" role="region" aria-label={label}>
      <div className="showcase-tilt">
        <ul className="showcase-ring" style={{ '--count': slides.length } as CSSProperties}>
          {slides.map((slide, i) => (
            <li
              key={slide.src}
              className="showcase-card"
              style={{ '--angle': `${(360 / slides.length) * i}deg` } as CSSProperties}
            >
              <figure className="group relative w-full h-full rounded-3xl overflow-hidden border border-white/10 bg-zinc-900 shadow-2xl shadow-blue-950/50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={slide.src}
                  alt={slide.prompt}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-4 pt-12">
                  <span className="block text-white text-sm md:text-base font-semibold">{slide.label}</span>
                  <span className="block text-zinc-300 text-xs mt-0.5 line-clamp-2">“{slide.prompt}”</span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
