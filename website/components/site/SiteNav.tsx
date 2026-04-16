'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const HKLogo = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" className="size-6" style={{ filter: 'drop-shadow(0 0 5px rgba(34,177,236,0.4))' }} aria-hidden="true">
    <rect width="28" height="28" rx="6" fill="#0d1016" />
    <text x="14" y="19" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="12" fill="#4ec7f2">hk</text>
  </svg>
);

const navLinks = [
  { href: '/docs', label: 'Docs' },
  { href: '/explore', label: 'Explore' },
  { href: '/docs/plugins/overview', label: 'Plugins' },
  { href: 'https://github.com/harnessprotocol/harness-kit', label: 'GitHub', external: true },
];

export function SiteNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b border-fd-border/30 bg-fd-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5 font-bold text-fd-foreground no-underline">
          <HKLogo />
          <span className="font-display">Harness Kit</span>
        </Link>
        <div className="flex items-center gap-6 text-sm">
          {navLinks.map(({ href, label, external }) => {
            const isActive = !external && pathname.startsWith(href);
            if (external) {
              return (
                <a
                  key={href}
                  href={href}
                  className="text-fd-muted-foreground transition-colors hover:text-fd-foreground no-underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {label}
                </a>
              );
            }
            return (
              <Link
                key={href}
                href={href}
                className={`transition-colors no-underline ${isActive ? 'font-medium text-fd-foreground' : 'text-fd-muted-foreground hover:text-fd-foreground'}`}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
