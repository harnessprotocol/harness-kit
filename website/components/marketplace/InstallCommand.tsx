'use client';

import { useState } from 'react';

export function InstallCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (e.g. non-secure context) — no-op.
    }
  };

  return (
    <div className="relative block w-full">
      <div
        className="absolute -inset-[1px] rounded-xl blur-[1px]"
        style={{
          background:
            'linear-gradient(90deg, rgba(34,177,236,0.3), rgba(14,165,233,0.2), rgba(34,177,236,0.3))',
        }}
        aria-hidden="true"
      />
      <div className="relative flex items-center gap-3 overflow-hidden rounded-xl border border-white/5 bg-fd-card px-4 py-2.5 sm:px-5 sm:py-3">
        <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-[12px] text-fd-foreground sm:text-sm">
          <span className="text-fd-muted-foreground" aria-hidden="true">$ </span>
          {command}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'Copied' : 'Copy install command'}
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
        >
          {copied ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cat-green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
