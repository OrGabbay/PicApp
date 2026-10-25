'use client';
import { useState } from 'react';
import type { GenerationItem } from '@/src/types/api';
import { useI18n } from '@/src/i18n';

interface ImageCardProps {
  image: GenerationItem;
  onClick?: (image: GenerationItem) => void;
  onFavoriteToggle?: (image: GenerationItem) => void;
  /** Shows a delete button on hover when provided */
  onDelete?: (image: GenerationItem) => void;
  /** 'square' crops to a square tile; 'natural' keeps the image's own proportions (masonry) */
  shape?: 'square' | 'natural';
  /** In selection mode a click toggles the selection instead of opening the image */
  selectionMode?: boolean;
  selected?: boolean;
  onSelectToggle?: (image: GenerationItem) => void;
}

export default function ImageCard({
  image,
  onClick,
  onFavoriteToggle,
  onDelete,
  shape = 'square',
  selectionMode = false,
  selected = false,
  onSelectToggle,
}: ImageCardProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [isFav, setIsFav] = useState(image.is_favorite);
  const { t, formatDate } = useI18n();

  const handleFavClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFav(!isFav);
    onFavoriteToggle?.(image);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(image);
  };

  const activate = () => (selectionMode ? onSelectToggle?.(image) : onClick?.(image));

  return (
    <div
      role={selectionMode ? 'checkbox' : 'button'}
      aria-checked={selectionMode ? selected : undefined}
      aria-label={selectionMode ? `${t('card.select')}: ${image.original_prompt}` : image.original_prompt}
      tabIndex={0}
      className={`group relative rounded-2xl overflow-hidden border bg-zinc-900 ${
        shape === 'square' ? 'aspect-square' : loaded ? '' : 'min-h-40'
      } cursor-pointer transition-all duration-300 focus-visible:outline-2 focus-visible:outline-blue-500 ${
        selected
          ? 'border-blue-500 ring-2 ring-blue-500/60'
          : 'border-zinc-800 hover:border-zinc-700 hover:shadow-xl hover:shadow-black/60'
      }`}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          activate();
        }
      }}
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
          <span className="text-xs">{t('card.loadFailed')}</span>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image.image_url}
          alt={image.original_prompt}
          className={`w-full ${shape === 'square' ? 'h-full object-cover' : 'h-auto block'} transition-all duration-500 ${
            selectionMode ? (selected ? 'scale-95' : 'opacity-80') : 'group-hover:scale-105'
          } ${loaded ? '' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          loading="lazy"
        />
      )}

      {selectionMode ? (
        /* Selection checkbox */
        <span
          aria-hidden="true"
          className={`absolute top-2.5 start-2.5 z-10 w-6 h-6 rounded-lg border-2 flex items-center justify-center text-xs font-bold transition-colors ${
            selected ? 'bg-blue-600 border-blue-600 text-white' : 'bg-black/40 border-white/70'
          }`}
        >
          {selected && '✓'}
        </span>
      ) : (
        <>
          {/* Delete button in the top start corner */}
          {onDelete && (
            <button
              type="button"
              onClick={handleDeleteClick}
              aria-label={t('card.delete')}
              title={t('card.delete')}
              className="absolute top-2.5 start-2.5 z-10 p-2 rounded-xl backdrop-blur-md bg-black/40 text-white/70 hover:text-white hover:bg-rose-600/90 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all duration-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                />
              </svg>
            </button>
          )}

          {/* Favorite badge in the top end corner */}
          <button
            type="button"
            onClick={handleFavClick}
            aria-label={isFav ? t('card.removeFavorite') : t('card.addFavorite')}
            className={`absolute top-2.5 end-2.5 z-10 p-2 rounded-xl backdrop-blur-md transition-all duration-200 ${
              isFav
                ? 'bg-rose-500/90 text-white shadow-md'
                : 'bg-black/40 text-white/70 hover:text-white hover:bg-black/70 opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
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
              <span>{formatDate(image.created_at)}</span>
              <span className="text-blue-400 font-semibold group-hover:underline">{t('card.view')}</span>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
