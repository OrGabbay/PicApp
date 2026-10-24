'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getUserStats } from '@/src/lib/api';
import type { UserStats } from '@/src/types/api';

export default function ProfilePage() {
  const [stats, setStats]     = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUserStats()
      .then((data) => setStats(data))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl mx-auto w-full px-6 py-10">
      {/* Profile Header */}
      <div className="flex items-center justify-between mb-8 pb-6 border-b border-zinc-800">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-2xl shadow-lg shadow-blue-900/30">
            👤
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Creator Profile</h1>
            <p className="text-zinc-400 text-xs mt-0.5 font-mono">test@example.com</p>
          </div>
        </div>

        <Link
          href="/settings"
          className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-xs font-semibold text-zinc-300 hover:text-white transition-colors"
        >
          ⚙️ Settings
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 shadow-md shadow-black/40">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Total Generations
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
          <p className="text-[11px] text-zinc-500 mt-2">Artworks crafted with AI</p>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 shadow-md shadow-black/40">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Favorites
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
          <p className="text-[11px] text-zinc-500 mt-2">Saved favorite masterpieces</p>
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
              Open Studio
            </h3>
            <p className="text-zinc-500 text-xs mt-0.5">Prompt, style, and generate images</p>
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
              Browse Gallery
            </h3>
            <p className="text-zinc-500 text-xs mt-0.5">View your full portfolio and favorites</p>
          </div>
        </Link>
      </div>
    </div>
  );
}