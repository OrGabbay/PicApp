'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/', label: 'Home', exact: true },
  { href: '/studio', label: 'Studio', exact: false },
  { href: '/gallery', label: 'Gallery', exact: false },
];

export default function Navbar() {
  const pathname = usePathname();

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-3 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800/60">
      {/* Left: Brand + Nav */}
      <div className="flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="text-xl leading-none">🎨</span>
          <span className="text-base font-bold text-white tracking-tight">PicApp</span>
        </Link>

        <div className="flex items-center gap-1">
          {NAV_LINKS.map(({ href, label, exact }) => (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive(href, exact)
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* Right: Settings + Profile */}
      <div className="flex items-center gap-1">
        <Link
          href="/settings"
          title="Settings"
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            isActive('/settings', false)
              ? 'bg-zinc-800 text-white'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
          }`}
        >
          ⚙️ Settings
        </Link>
        <Link
          href="/profile"
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            isActive('/profile', false)
              ? 'bg-zinc-800 text-white'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
          }`}
        >
          Profile
        </Link>
      </div>
    </nav>
  );
}