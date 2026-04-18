'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HarnessKitLogo } from '@/components/site/HarnessKitLogo';

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
          <HarnessKitLogo glow />
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
          <button
            aria-label="Toggle Theme"
            data-theme-toggle=""
            className="flex size-8 cursor-pointer items-center justify-center rounded-md text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
          >
            {/* Sun — shown in dark mode */}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4 dark:block hidden" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
            {/* Moon — shown in light mode */}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4 dark:hidden block" aria-hidden="true">
              <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
}
