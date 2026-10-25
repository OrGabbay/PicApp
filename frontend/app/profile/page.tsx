'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getUserStats } from '@/src/lib/api';
import { useCurrentUser } from '@/src/lib/useCurrentUser';
import { useI18n } from '@/src/i18n';
import type { UserStats } from '@/src/types/api';

export default function ProfilePage() {
  const [stats, setStats]     = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const user = useCurrentUser();
  const { t, formatDate } = useI18n();

  useEffect(() => {
    if (!user) return;
    getUserStats()
      .then((data) => setStats(data))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [user]);

  if (user === null) {
    return (
      <div className="max-w-3xl mx-auto w-full px-6 py-10">
        <div className="flex flex-col items-center justify-center py-24 text-center max-w-sm mx-auto">
          <div className="w-20 h-20 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-4xl mb-5 shadow-inner">
            👤
          </div>
          <h1 className="text-white font-bold text-lg mb-1">{t('profile.loginTitle')}</h1>
          <p className="text-zinc-500 text-xs leading-relaxed mb-6">
            {t('profile.loginText')}
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
    <div className="max-w-3xl mx-auto w-full px-6 py-10">
      {/* Profile Header */}
      <div className="flex items-center justify-between mb-8 pb-6 border-b border-zinc-800">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-2xl shadow-lg shadow-blue-900/30">
            👤
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">{t('profile.title')}</h1>
            {user ? (
              <p className="text-zinc-400 text-xs mt-0.5 font-mono">
                {t('profile.memberSince', { email: user.email, date: formatDate(user.created_at) })}
              </p>
            ) : (
              <div className="h-3 w-40 bg-zinc-800 rounded animate-pulse mt-1.5" />
            )}
          </div>
        </div>

        <Link
          href="/settings"
          className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-xs font-semibold text-zinc-300 hover:text-white transition-colors"
        >
          ⚙️ {t('nav.settings')}
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 shadow-md shadow-black/40">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              {t('profile.totalGenerations')}
            </span>
            <span className="text-xl">🎨</span>
          </div>
          {loading ? (
            <div className="h-10 w-20 bg-zinc-800 rounded-xl animate-pulse mt-1" />
          ) : (
            <p className="text-4xl font-extrabold text-white mt-1">
              {stats?.total_generations ?? 0}
            </p>
          )}
          <p className="text-[11px] text-zinc-500 mt-2">{t('profile.totalGenerationsHint')}</p>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 shadow-md shadow-black/40">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              {t('profile.favorites')}
            </span>
            <span className="text-xl">❤️</span>
          </div>
          {loading ? (
            <div className="h-10 w-20 bg-zinc-800 rounded-xl animate-pulse mt-1" />
          ) : (
            <p className="text-4xl font-extrabold text-rose-400 mt-1">
              {stats?.total_favorites ?? 0}
            </p>
          )}
          <p className="text-[11px] text-zinc-500 mt-2">{t('profile.favoritesHint')}</p>
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/studio"
          className="group flex items-center gap-4 bg-zinc-900/80 border border-zinc-800 hover:border-blue-500/50 rounded-3xl p-6 transition-all duration-200"
        >
          <div className="w-12 h-12 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-2xl group-hover:scale-105 transition-transform">
            ✨
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm group-hover:text-blue-400 transition-colors">
              {t('profile.openStudio')}
            </h3>
            <p className="text-zinc-500 text-xs mt-0.5">{t('profile.openStudioHint')}</p>
          </div>
        </Link>

        <Link
          href="/gallery"
          className="group flex items-center gap-4 bg-zinc-900/80 border border-zinc-800 hover:border-rose-500/50 rounded-3xl p-6 transition-all duration-200"
        >
          <div className="w-12 h-12 rounded-2xl bg-rose-600/10 border border-rose-500/20 flex items-center justify-center text-2xl group-hover:scale-105 transition-transform">
            🖼️
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm group-hover:text-rose-400 transition-colors">
              {t('profile.browseGallery')}
            </h3>
            <p className="text-zinc-500 text-xs mt-0.5">{t('profile.browseGalleryHint')}</p>
          </div>
        </Link>
      </div>
    </div>
  );
}