'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clearStoredApiKey, logout } from '@/src/lib/api';
import { useCurrentUser } from '@/src/lib/useCurrentUser';
import { useI18n, type MessageKey } from '@/src/i18n';

const NAV_LINKS: { href: string; label: MessageKey; exact: boolean }[] = [
  { href: '/', label: 'nav.home', exact: true },
  { href: '/studio', label: 'nav.studio', exact: false },
  { href: '/gallery', label: 'nav.gallery', exact: false },
];

export default function Navbar() {
  const pathname = usePathname();
  const user = useCurrentUser();
  const { t } = useI18n();

  const handleLogout = async () => {
    await logout();
    clearStoredApiKey();
    // Full reload so every page drops the user's data
    window.location.assign('/');
  };

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between gap-2 px-3 sm:px-6 py-3 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800/60">
      {/* Left: Brand + Nav */}
      <div className="flex items-center gap-2 sm:gap-6 min-w-0">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="text-xl leading-none">🎨</span>
          <span className="hidden sm:inline text-base font-bold text-white tracking-tight">PicApp</span>
        </Link>

        <div className="flex items-center gap-0.5 sm:gap-1">
          {NAV_LINKS.map(({ href, label, exact }) => (
            <Link
              key={href}
              href={href}
              className={`${href === '/' ? 'hidden sm:block ' : ''}px-2.5 sm:px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive(href, exact)
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              }`}
            >
              {t(label)}
            </Link>
          ))}
        </div>
      </div>

      {/* Right: Settings + Account */}
      <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
        <Link
          href="/settings"
          title={t('nav.settings')}
          aria-label={t('nav.settings')}
          className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            isActive('/settings', false)
              ? 'bg-zinc-800 text-white'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
          }`}
        >
          ⚙️<span className="hidden sm:inline"> {t('nav.settings')}</span>
        </Link>

        {user ? (
          <>
            <Link
              href="/profile"
              title={user.email}
              aria-label={t('nav.profile')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-sm font-medium transition-colors max-w-[180px] truncate ${
                isActive('/profile', false)
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              }`}
            >
              👤<span className="hidden md:inline"> {user.email}</span>
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-colors whitespace-nowrap"
            >
              {t('nav.logout')}
            </button>
          </>
        ) : user === null ? (
          <>
            <Link
              href="/login"
              className="px-2.5 sm:px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-colors whitespace-nowrap"
            >
              {t('nav.login')}
            </Link>
            <Link
              href="/register"
              className="px-2.5 sm:px-3 py-1.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors whitespace-nowrap"
            >
              {t('nav.signup')}
            </Link>
          </>
        ) : null}
      </div>
    </nav>
  );
}