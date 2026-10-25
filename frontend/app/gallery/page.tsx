'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  getGenerationHistory,
  toggleFavorite,
  deleteGeneration,
  deleteGenerations,
  downloadImage,
  AuthRequiredError,
} from '@/src/lib/api';
import { useCurrentUser } from '@/src/lib/useCurrentUser';
import { usePreferences, type GallerySize } from '@/src/lib/preferences';
import { useI18n } from '@/src/i18n';
import ImageCard from '@/src/components/ImageCard';
import ConfirmDialog from '@/src/components/ConfirmDialog';
import type { GenerationItem } from '@/src/types/api';

const PAGE_SIZE = 18;

// Thumbnail size preference → number of columns per breakpoint
const GRID_COLUMNS: Record<GallerySize, string> = {
  small: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8',
  medium: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6',
  large: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
};
const MASONRY_COLUMNS: Record<GallerySize, string> = {
  small: 'columns-3 sm:columns-4 md:columns-6 lg:columns-8',
  medium: 'columns-2 sm:columns-3 md:columns-4 lg:columns-5',
  large: 'columns-1 sm:columns-2 lg:columns-3',
};

export default function GalleryPage() {
  const [images, setImages]           = useState<GenerationItem[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage]               = useState(1);
  const [hasMore, setHasMore]         = useState(false);
  const [total, setTotal]             = useState(0);
  const [activeTab, setActiveTab]     = useState<'all' | 'favorites'>('all');
  const [selected, setSelected]       = useState<GenerationItem | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [copied, setCopied]           = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // IDs waiting for confirmation in the delete dialog
  const [pendingDelete, setPendingDelete] = useState<number[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const user = useCurrentUser();
  const { gallerySize, gallerySort, galleryLayout } = usePreferences();
  const { t, formatDate } = useI18n();

  const loadGallery = useCallback(async (pageNum: number, favOnly: boolean) => {
    try {
      const data = await getGenerationHistory(pageNum, PAGE_SIZE, favOnly, gallerySort);
      setImages((prev) => (pageNum === 1 ? data.items : [...prev, ...data.items]));
      setHasMore(data.has_more);
      setTotal(data.total);
      setPage(pageNum);
      setError(null);
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        setSessionExpired(true);
      } else {
        setError(t('gallery.loadError'));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- t only changes with the language
  }, [gallerySort]);

  // The gallery is loading until the current tab/order has finished loading
  const queryKey = `${user?.id}|${activeTab}|${gallerySort}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loading = loadedKey !== queryKey;

  useEffect(() => {
    if (!user) return;
    // Ignore a response that arrives after the tab/order changed again
    let active = true;
    getGenerationHistory(1, PAGE_SIZE, activeTab === 'favorites', gallerySort)
      .then((data) => {
        if (!active) return;
        setImages(data.items);
        setHasMore(data.has_more);
        setTotal(data.total);
        setPage(1);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof AuthRequiredError) setSessionExpired(true);
        else setError(t('gallery.loadError'));
      })
      .finally(() => {
        if (active) setLoadedKey(queryKey);
      });
    return () => {
      active = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- t only changes with the language
  }, [user, activeTab, gallerySort, queryKey]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    await loadGallery(page + 1, activeTab === 'favorites');
    setLoadingMore(false);
  };

  const handleToggleFav = async (img: GenerationItem) => {
    if (img.id === null) return;
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

  const handleDelete = (img: GenerationItem) => {
    if (img.id !== null) setPendingDelete([img.id]);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const ids = pendingDelete;
    setDeleting(true);
    try {
      if (ids.length === 1) {
        await deleteGeneration(ids[0]);
      } else {
        await deleteGenerations(ids);
      }
      const removed = new Set(ids);
      setImages((prev) => prev.filter((i) => i.id === null || !removed.has(i.id)));
      setTotal((prev) => Math.max(0, prev - ids.length));
      setSelectedIds((prev) => new Set([...prev].filter((id) => !removed.has(id))));
      if (selected?.id != null && removed.has(selected.id)) setSelected(null);
      if (selectionMode) exitSelection();
      // Later pages shift after a delete, so reload from the start to keep paging correct
      if (hasMore) loadGallery(1, activeTab === 'favorites');
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        setSessionExpired(true);
      } else {
        setError(t('gallery.deleteFailed'));
      }
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  const toggleSelected = (img: GenerationItem) => {
    if (img.id === null) return;
    const id = img.id;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const switchTab = (tab: 'all' | 'favorites') => {
    exitSelection();
    setActiveTab(tab);
  };

  const handleCopyPrompt = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Galleries are personal: guests (or expired sessions) are asked to log in
  if (user === null || sessionExpired) {
    return (
      <div className="max-w-7xl mx-auto w-full px-6 py-10 md:px-8">
        <div className="flex flex-col items-center justify-center py-24 text-center max-w-sm mx-auto">
          <div className="w-20 h-20 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-4xl mb-5 shadow-inner">
            🔒
          </div>
          <h1 className="text-white font-bold text-lg mb-1">
            {sessionExpired ? t('gallery.expiredTitle') : t('gallery.loginTitle')}
          </h1>
          <p className="text-zinc-500 text-xs leading-relaxed mb-6">
            {t('gallery.loginText')}
          </p>
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
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto w-full px-6 py-10 md:px-8">
      {/* Header and Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">{t('gallery.title')}</h1>
          <p className="text-zinc-400 text-sm mt-1">
            {total === 1 ? t('gallery.countOne') : t('gallery.count', { count: total })}
          </p>
        </div>

        <div className="flex items-center gap-2">
        {images.length > 0 && !selectionMode && (
          <button
            type="button"
            onClick={() => setSelectionMode(true)}
            className="px-4 py-2 rounded-2xl text-xs font-semibold bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors"
          >
            ☑️ {t('gallery.select')}
          </button>
        )}

        {/* Tab Filters */}
        <div className="inline-flex p-1 bg-zinc-900 border border-zinc-800 rounded-2xl">
          <button
            onClick={() => switchTab('all')}
            className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'all'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            {t('gallery.tabAll')}
          </button>
          <button
            onClick={() => switchTab('favorites')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'favorites'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <span>❤️</span> {t('gallery.tabFavorites')}
          </button>
        </div>
        </div>
      </div>

      {/* Selection toolbar (sticks under the navbar while scrolling) */}
      {selectionMode && (
        <div className="sticky top-[57px] z-40 mb-6 flex flex-wrap items-center gap-2 bg-zinc-950/90 backdrop-blur-md border border-zinc-800 rounded-2xl p-3">
          <span className="text-sm font-semibold text-white me-auto" aria-live="polite">
            {t('gallery.selectedCount', { count: selectedIds.size })}
          </span>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set(images.flatMap((i) => (i.id === null ? [] : [i.id]))))}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
          >
            {t('gallery.selectAll')}
          </button>
          <button
            type="button"
            onClick={() => setPendingDelete([...selectedIds])}
            disabled={selectedIds.size === 0}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            🗑️ {t('gallery.deleteSelected')}
          </button>
          <button
            type="button"
            onClick={exitSelection}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
          >
            {t('gallery.cancel')}
          </button>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-3 bg-rose-950/40 border border-rose-800/60 rounded-2xl p-4 mb-8">
          <span className="text-rose-400 text-xl">⚠️</span>
          <p className="text-xs text-rose-300">{error}</p>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading ? (
        <div className={`grid ${GRID_COLUMNS[gallerySize]} gap-3.5`}>
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
            {activeTab === 'favorites' ? t('gallery.emptyFavoritesTitle') : t('gallery.emptyTitle')}
          </h2>
          <p className="text-zinc-500 text-xs leading-relaxed mb-6">
            {activeTab === 'favorites' ? t('gallery.emptyFavoritesText') : t('gallery.emptyText')}
          </p>
          <Link
            href="/studio"
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs transition-colors shadow-lg shadow-blue-900/30"
          >
            {t('gallery.goToStudio')}
          </Link>
        </div>
      ) : (
        /* Image Grid */
        <>
          {galleryLayout === 'masonry' ? (
            <div className={`${MASONRY_COLUMNS[gallerySize]} gap-3.5`}>
              {images.map((item) => (
                <div key={item.id} className="break-inside-avoid mb-3.5">
                  <ImageCard
                    image={item}
                    shape="natural"
                    onClick={setSelected}
                    onFavoriteToggle={handleToggleFav}
                    onDelete={handleDelete}
                    selectionMode={selectionMode}
                    selected={item.id !== null && selectedIds.has(item.id)}
                    onSelectToggle={toggleSelected}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className={`grid ${GRID_COLUMNS[gallerySize]} gap-3.5`}>
              {images.map((item) => (
                <ImageCard
                  key={item.id}
                  image={item}
                  onClick={setSelected}
                  onFavoriteToggle={handleToggleFav}
                  onDelete={handleDelete}
                  selectionMode={selectionMode}
                  selected={item.id !== null && selectedIds.has(item.id)}
                  onSelectToggle={toggleSelected}
                />
              ))}
            </div>
          )}

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
                {loadingMore ? t('gallery.loadingMore') : t('gallery.loadMore')}
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
              className="absolute top-4 end-4 z-20 p-2 rounded-full bg-black/60 text-white hover:bg-black/90 transition-colors"
              aria-label={t('gallery.closeModal')}
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
                  {t('gallery.created', { date: formatDate(selected.created_at) })}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => downloadImage(selected.image_url, `picapp-${selected.id}.jpg`)}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <span>💾</span> {t('gallery.download')}
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
                    {selected.is_favorite ? t('studio.favorited') : t('studio.favorite')}
                  </button>

                  <button
                    onClick={() => handleCopyPrompt(selected.original_prompt)}
                    className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium transition-colors"
                  >
                    {copied ? t('gallery.copied') : t('gallery.copyPrompt')}
                  </button>

                  <button
                    onClick={() => handleDelete(selected)}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-rose-900/50 hover:text-rose-300 text-zinc-400 rounded-xl text-xs font-medium transition-colors"
                    title={t('gallery.delete')}
                    aria-label={t('gallery.delete')}
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {selected.engine && (
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-blue-950/50 border border-blue-800/40 text-blue-300 text-[11px] font-semibold">
                    {t('studio.generatedWith', { engine: selected.engine })}
                  </span>
                </div>
              )}

              <div>
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">
                  {t('studio.originalPrompt')}
                </span>
                <p className="text-zinc-200 text-sm leading-relaxed">{selected.original_prompt}</p>
              </div>

              {selected.enhanced_prompt && (
                <div>
                  <span className="text-[10px] font-bold text-violet-400 uppercase tracking-widest block mb-1">
                    {t('studio.enhancedPrompt')}
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

      <ConfirmDialog
        open={pendingDelete !== null}
        title={
          pendingDelete && pendingDelete.length > 1
            ? t('gallery.confirmDeleteManyTitle', { count: pendingDelete.length })
            : t('gallery.confirmDeleteTitle')
        }
        message={
          pendingDelete && pendingDelete.length > 1 ? t('gallery.confirmDeleteManyText') : t('gallery.confirmDeleteText')
        }
        confirmLabel={t('gallery.deleteConfirm')}
        cancelLabel={t('gallery.cancel')}
        busy={deleting}
        busyLabel={t('gallery.deleting')}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}