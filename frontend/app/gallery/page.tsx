'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  getGenerationHistory,
  toggleFavorite,
  deleteGeneration,
  downloadImage,
} from '@/src/lib/api';
import ImageCard from '@/src/components/ImageCard';
import type { GenerationItem } from '@/src/types/api';

const PAGE_SIZE = 18;

export default function GalleryPage() {
  const [images, setImages]           = useState<GenerationItem[]>([]);
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage]               = useState(1);
  const [hasMore, setHasMore]         = useState(false);
  const [total, setTotal]             = useState(0);
  const [activeTab, setActiveTab]     = useState<'all' | 'favorites'>('all');
  const [selected, setSelected]       = useState<GenerationItem | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [copied, setCopied]           = useState(false);

  const loadGallery = useCallback(async (pageNum: number, favOnly: boolean) => {
    try {
      const data = await getGenerationHistory(pageNum, PAGE_SIZE, favOnly);
      setImages((prev) => (pageNum === 1 ? data.items : [...prev, ...data.items]));
      setHasMore(data.has_more);
      setTotal(data.total);
      setPage(pageNum);
      setError(null);
    } catch {
      setError('Could not load gallery from backend.');
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadGallery(1, activeTab === 'favorites').finally(() => setLoading(false));
  }, [activeTab, loadGallery]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    await loadGallery(page + 1, activeTab === 'favorites');
    setLoadingMore(false);
  };

  const handleToggleFav = async (img: GenerationItem) => {
    try {
      const res = await toggleFavorite(img.id);
      const updated = { ...img, is_favorite: res.is_favorite };
      if (selected?.id === img.id) {
        setSelected(updated);
      }
      setImages((prev) => {
        if (activeTab === 'favorites' && !res.is_favorite) {
          return prev.filter((i) => i.id !== img.id);
        }
        return prev.map((i) => (i.id === img.id ? updated : i));
      });
      if (activeTab === 'favorites' && !res.is_favorite) {
        setTotal((prev) => Math.max(0, prev - 1));
      }
    } catch {}
  };

  const handleDelete = async (img: GenerationItem) => {
    if (!confirm('Are you sure you want to delete this artwork?')) return;
    try {
      await deleteGeneration(img.id);
      setImages((prev) => prev.filter((i) => i.id !== img.id));
      setTotal((prev) => Math.max(0, prev - 1));
      setSelected(null);
    } catch {
      alert('Failed to delete image');
    }
  };

  const handleCopyPrompt = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto w-full px-6 py-10 md:px-8">
      {/* Header and Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Community Gallery</h1>
          <p className="text-zinc-400 text-sm mt-1">
            {total} artwork{total !== 1 ? 's' : ''} generated
          </p>
        </div>

        {/* Tab Filters */}
        <div className="inline-flex p-1 bg-zinc-900 border border-zinc-800 rounded-2xl">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'all'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            All Creations
          </button>
          <button
            onClick={() => setActiveTab('favorites')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'favorites'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <span>❤️</span> Favorites
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-3 bg-rose-950/40 border border-rose-800/60 rounded-2xl p-4 mb-8">
          <span className="text-rose-400 text-xl">⚠️</span>
          <p className="text-xs text-rose-300">{error}</p>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
          {Array.from({ length: 12 }).map((_, idx) => (
            <div
              key={idx}
              className="aspect-square rounded-2xl bg-zinc-900 border border-zinc-800/80 animate-pulse"
              style={{ animationDelay: `${idx * 50}ms` }}
            />
          ))}
        </div>
      ) : images.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-24 text-center max-w-sm mx-auto">
          <div className="w-20 h-20 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-4xl mb-5 shadow-inner">
            {activeTab === 'favorites' ? '❤️' : '🖼️'}
          </div>
          <h2 className="text-white font-bold text-lg mb-1">
            {activeTab === 'favorites' ? 'No favorites yet' : 'No images found'}
          </h2>
          <p className="text-zinc-500 text-xs leading-relaxed mb-6">
            {activeTab === 'favorites'
              ? 'Click the heart icon on any artwork to save it to your favorites list.'
              : 'Start your creative journey in the AI Studio.'}
          </p>
          <Link
            href="/studio"
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs transition-colors shadow-lg shadow-blue-900/30"
          >
            🎨 Go to AI Studio
          </Link>
        </div>
      ) : (
        /* Image Grid */
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
            {images.map((item) => (
              <ImageCard
                key={item.id}
                image={item}
                onClick={setSelected}
                onFavoriteToggle={handleToggleFav}
              />
            ))}
          </div>

          {/* Load More Button */}
          {hasMore && (
            <div className="flex justify-center mt-12">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-7 py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white text-xs font-semibold rounded-2xl transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {loadingMore && (
                  <span className="w-3.5 h-3.5 border-2 border-zinc-500 border-t-white rounded-full animate-spin inline-block" />
                )}
                {loadingMore ? 'Loading artwork...' : 'Load More Creations'}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── High-Resolution Lightbox Modal ── */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 sm:p-6"
          onClick={() => setSelected(null)}
        >
          <div
            className="relative bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Close Button */}
            <button
              onClick={() => setSelected(null)}
              className="absolute top-4 right-4 z-20 p-2 rounded-full bg-black/60 text-white hover:bg-black/90 transition-colors"
              aria-label="Close modal"
            >
              ✕
            </button>

            {/* Artwork Display */}
            <div className="bg-black flex items-center justify-center overflow-hidden max-h-[55vh]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selected.image_url}
                alt={selected.original_prompt}
                className="w-full h-full max-h-[55vh] object-contain"
              />
            </div>

            {/* Details & Actions Footer */}
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
                <span className="text-xs text-zinc-500">
                  Created {new Date(selected.created_at).toLocaleString()}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => downloadImage(selected.image_url, `picapp-${selected.id}.jpg`)}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <span>💾</span> Download
                  </button>

                  <button
                    onClick={() => handleToggleFav(selected)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors flex items-center gap-1.5 ${
                      selected.is_favorite
                        ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                        : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300'
                    }`}
                  >
                    <span>{selected.is_favorite ? '❤️' : '🤍'}</span>
                    {selected.is_favorite ? 'Favorited' : 'Favorite'}
                  </button>

                  <button
                    onClick={() => handleCopyPrompt(selected.original_prompt)}
                    className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium transition-colors"
                  >
                    {copied ? '✓ Copied' : '📋 Copy Prompt'}
                  </button>

                  <button
                    onClick={() => handleDelete(selected)}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-rose-900/50 hover:text-rose-300 text-zinc-400 rounded-xl text-xs font-medium transition-colors"
                    title="Delete generation"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {selected.engine && (
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-blue-950/50 border border-blue-800/40 text-blue-300 text-[11px] font-semibold">
                    🎨 Generated with {selected.engine}
                  </span>
                </div>
              )}

              <div>
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">
                  Original Prompt
                </span>
                <p className="text-zinc-200 text-sm leading-relaxed">{selected.original_prompt}</p>
              </div>

              {selected.enhanced_prompt && (
                <div>
                  <span className="text-[10px] font-bold text-violet-400 uppercase tracking-widest block mb-1">
                    ✨ AI Enhanced Prompt
                  </span>
                  <p className="text-zinc-400 text-xs font-mono bg-zinc-900 p-3 rounded-xl border border-zinc-800/80 leading-relaxed">
                    {selected.enhanced_prompt}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}