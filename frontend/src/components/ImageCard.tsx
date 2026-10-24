'use client';
import { useState } from 'react';
import type { GenerationItem } from '@/src/types/api';

interface ImageCardProps {
  image: GenerationItem;
  onClick?: (image: GenerationItem) => void;
  onFavoriteToggle?: (image: GenerationItem) => void;
}

export default function ImageCard({ image, onClick, onFavoriteToggle }: ImageCardProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [isFav, setIsFav] = useState(image.is_favorite);

  const handleFavClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFav(!isFav);
    onFavoriteToggle?.(image);
  };

  return (
    <div
      className="group relative rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900 aspect-square cursor-pointer transition-all duration-300 hover:border-zinc-700 hover:shadow-xl hover:shadow-black/60"
      onClick={() => onClick?.(image)}
      title={image.original_prompt}
    >
      {/* Loading placeholder spinner */}
      {!loaded && !errored && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/60">
          <div className="w-6 h-6 border-2 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
        </div>
      )}

      {/* Error state */}
      {errored ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600 gap-1 p-3 text-center">
          <span className="text-2xl">⚠️</span>
          <span className="text-xs">Failed to load image</span>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image.image_url}
          alt={image.original_prompt}
          className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          loading="lazy"
        />
      )}

      {/* Favorite badge in top right */}
      <button
        onClick={handleFavClick}
        aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
        className={`absolute top-2.5 right-2.5 z-10 p-2 rounded-xl backdrop-blur-md transition-all duration-200 ${
          isFav
            ? 'bg-rose-500/90 text-white shadow-md'
            : 'bg-black/40 text-white/70 hover:text-white hover:bg-black/70 opacity-0 group-hover:opacity-100'
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill={isFav ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
          className="w-4 h-4"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
          />
        </svg>
      </button>

      {/* Bottom gradient hover details */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3.5 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
        <p className="text-white text-xs font-medium line-clamp-2 leading-relaxed">
          {image.original_prompt}
        </p>
        <p className="text-zinc-400 text-[10px] mt-1.5 flex items-center justify-between">
          <span>{new Date(image.created_at).toLocaleDateString()}</span>
          <span className="text-blue-400 font-semibold group-hover:underline">View →</span>
        </p>
      </div>
    </div>
  );
}
