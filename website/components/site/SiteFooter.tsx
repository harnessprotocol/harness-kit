import Link from 'next/link';
import { HarnessKitLogo } from '@/components/site/HarnessKitLogo';

export function SiteFooter() {
  return (
    <footer className="relative border-t border-fd-border/30">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-fd-primary/20 to-transparent" aria-hidden="true" />
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-12 text-sm sm:grid-cols-4">
        {/* Brand */}
        <div className="sm:col-span-2">
          <div className="mb-3 flex items-center gap-2 font-bold text-fd-foreground">
            <HarnessKitLogo />
            <span className="font-display">Harness Kit</span>
          </div>
          <p className="text-fd-muted-foreground leading-relaxed max-w-xs">
            The configuration console for all your AI coding harnesses. Open source, keyboard-first, built on an open spec.
          </p>
        </div>
        {/* Product */}
        <div>
          <h5 className="mb-3 font-semibold text-fd-foreground text-xs uppercase tracking-widest">Product</h5>
          <ul className="space-y-2 text-fd-muted-foreground">
            <li><Link href="/docs/getting-started/installation" className="transition-colors hover:text-fd-foreground no-underline">Get started</Link></li>
            <li><Link href="/explore" className="transition-colors hover:text-fd-foreground no-underline">Explore</Link></li>
            <li><Link href="/docs/plugins/overview" className="transition-colors hover:text-fd-foreground no-underline">Plugins</Link></li>
          </ul>
        </div>
        {/* Community */}
        <div>
          <h5 className="mb-3 font-semibold text-fd-foreground text-xs uppercase tracking-widest">Community</h5>
          <ul className="space-y-2 text-fd-muted-foreground">
            <li>
              <a href="https://github.com/harnessprotocol/harness-kit" className="transition-colors hover:text-fd-foreground no-underline" target="_blank" rel="noreferrer">GitHub</a>
            </li>
            <li><Link href="/docs" className="transition-colors hover:text-fd-foreground no-underline">Documentation</Link></li>
          </ul>
        </div>
        {/* Contact */}
        <div>
          <h5 className="mb-3 font-semibold text-fd-foreground text-xs uppercase tracking-widest">Contact</h5>
          <ul className="space-y-2 text-fd-muted-foreground">
            <li><a href="mailto:contact@harnesskit.ai" className="transition-colors hover:text-fd-foreground no-underline">contact@harnesskit.ai</a></li>
            <li><a href="https://github.com/harnessprotocol/harness-kit/security/policy" className="transition-colors hover:text-fd-foreground no-underline" target="_blank" rel="noreferrer">Security Policy</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-fd-border/20 px-6 py-4 text-center text-xs text-fd-muted-foreground">
        © {new Date().getFullYear()} Harness Kit Contributors · Apache-2.0 License
      </div>
    </footer>
  );
}
