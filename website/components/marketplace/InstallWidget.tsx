'use client';

import { useState } from 'react';
import { InstallCommand } from './InstallCommand';
import { cursorDeepLink } from '@/lib/marketplace/deeplinks';
import type { MarketplaceMcp, MarketplacePlugin, MarketplaceProfile } from '@/lib/marketplace/types';

// ── Tab types ────────────────────────────────────────────────

type Tab = 'claude' | 'cli' | 'cursor';

// Plugins lead with Claude Code (a single command). Profiles lead with the Harness CLI,
// the only genuine one-shot path — Claude Code runs slash commands one at a time, so it
// can't install a whole bundle in one action.
const PLUGIN_TABS: { id: Tab; label: string }[] = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'cli', label: 'npx / CLI' },
  { id: 'cursor', label: 'Cursor' },
];

const PROFILE_TABS: { id: Tab; label: string }[] = [
  { id: 'cli', label: 'Harness CLI' },
  { id: 'claude', label: 'Claude Code' },
  { id: 'cursor', label: 'Cursor' },
];

// ── Download button (profile harness.yaml) ───────────────────

function DownloadYaml({ slug, yaml }: { slug: string; yaml: string }) {
  const handleDownload = () => {
    const url = `data:text/yaml;charset=utf-8,${encodeURIComponent(yaml)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}.harness.yaml`;
    a.click();
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="flex w-full cursor-pointer items-center gap-2 rounded-xl bg-fd-card px-4 py-2.5 text-sm text-fd-foreground transition-colors hover:bg-fd-card/80 sm:px-5 sm:py-3"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2v13M5 9l7 7 7-7" />
        <path d="M5 20h14" />
      </svg>
      <code className="font-mono text-[12px] sm:text-sm">{slug}.harness.yaml</code>
    </button>
  );
}

// ── Multi-command block with a single "Copy all" ─────────────

function CommandBlock({ commands }: { commands: string[] }) {
  const [copied, setCopied] = useState(false);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(commands.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable — no-op.
    }
  };

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-fd-card shadow-[var(--shadow-sm)]">
      <button
        type="button"
        onClick={copyAll}
        aria-label={copied ? 'Copied all commands' : 'Copy all commands'}
        className="absolute right-2 top-2 flex cursor-pointer items-center gap-1.5 rounded-md bg-fd-card/80 px-2 py-1 text-[11px] font-medium text-fd-muted-foreground backdrop-blur transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
      >
        {copied ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--cat-green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
        {copied ? 'Copied' : 'Copy all'}
      </button>
      <pre className="overflow-x-auto px-4 py-3 pr-20 font-mono text-[12px] leading-relaxed text-fd-foreground sm:text-sm">
        {commands.map((c, i) => (
          <div key={i} className="whitespace-pre">
            <span className="text-fd-muted-foreground" aria-hidden="true">$ </span>
            {c}
          </div>
        ))}
      </pre>
    </div>
  );
}

// ── Cursor deep-link button ──────────────────────────────────

function CursorButton({ pluginName, mcp }: { pluginName: string; mcp: MarketplaceMcp }) {
  const href = cursorDeepLink(pluginName, mcp);
  return (
    <a
      href={href}
      className="inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-fd-foreground transition-all hover:opacity-90 sm:px-5 sm:py-3"
      style={{ background: 'var(--accent)', color: '#fff' }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
      Add to Cursor
    </a>
  );
}

// ── Plugin install content ────────────────────────────────────

function PluginClaudeTab({ plugin }: { plugin: MarketplacePlugin }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fd-muted-foreground">
        Add the marketplace once, then install the plugin:
      </p>
      <InstallCommand command="/plugin marketplace add harnessprotocol/harness-kit" />
      <InstallCommand command={plugin.installCommand} />
    </div>
  );
}

function PluginCliTab({ plugin }: { plugin: MarketplacePlugin }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-sm text-fd-muted-foreground">Run ephemerally (no install):</p>
        <InstallCommand command={`npx @harness-kit/cli run ${plugin.name}@harnessprotocol/harness-kit`} />
      </div>
      <details className="rounded-xl bg-fd-card/40 px-4 py-3 text-sm">
        <summary className="cursor-pointer text-fd-muted-foreground select-none">
          Add permanently to a project harness
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-xs text-fd-muted-foreground">
            1. Add to your <code className="font-mono">harness.yaml</code> plugins list, then:
          </p>
          <InstallCommand command="npx @harness-kit/cli sync" />
          <InstallCommand command="npx @harness-kit/cli compile" />
        </div>
      </details>
    </div>
  );
}

function PluginCursorTab({ plugin }: { plugin: MarketplacePlugin }) {
  if (!plugin.mcp) {
    return (
      <p className="text-sm text-fd-muted-foreground">
        This plugin doesn&apos;t expose an MCP server — the Cursor deep-link is only available for
        plugins that include an MCP server configuration.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fd-muted-foreground">
        One click to add the MCP server to Cursor:
      </p>
      <CursorButton pluginName={plugin.name} mcp={plugin.mcp} />
    </div>
  );
}

// ── Profile install content ───────────────────────────────────

function ProfileClaudeTab({ profile }: { profile: MarketplaceProfile }) {
  const installs = profile.plugins
    .filter((r) => r.resolved)
    .map((ref) => `/plugin install ${ref.name}@harness-kit`);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fd-muted-foreground">
        Add the marketplace once, then run each install (Claude Code executes slash commands one at a
        time). Use <strong className="font-medium text-fd-foreground">Copy all</strong> to grab the
        full set:
      </p>
      <InstallCommand command="/plugin marketplace add harnessprotocol/harness-kit" />
      <CommandBlock commands={installs} />
      <p className="text-xs text-fd-muted-foreground">
        Prefer one command? The <strong className="font-medium text-fd-foreground">Harness CLI</strong>{' '}
        tab applies the whole profile — and every other AI tool — in one shot.
      </p>
    </div>
  );
}

function ProfileCliTab({ profile }: { profile: MarketplaceProfile }) {
  return (
    <div className="flex flex-col gap-4">
      <div
        className="rounded-xl p-4"
        style={{ background: 'var(--accent-light)' }}
      >
        <p className="mb-1 text-sm font-medium text-fd-foreground">
          One-shot setup — download &amp; apply the whole profile
        </p>
        <p className="mb-3 text-xs leading-relaxed text-fd-muted-foreground">
          Grab the profile&apos;s <code className="font-mono">harness.yaml</code>, then sync and
          compile. Works across Claude Code, Cursor, and Copilot at once.
        </p>
        <DownloadYaml slug={profile.slug} yaml={profile.harnessYaml} />
      </div>
      <div className="flex flex-col gap-3">
        <InstallCommand command="npx @harness-kit/cli sync" />
        <InstallCommand command="npx @harness-kit/cli compile" />
      </div>
      <p className="text-xs text-fd-muted-foreground">
        <code className="font-mono">compile</code> writes native config for Claude Code, Cursor, and
        Copilot automatically based on what&apos;s installed.
      </p>
    </div>
  );
}

function ProfileCursorTab({ profile }: { profile: MarketplaceProfile }) {
  const mcpPlugins = profile.plugins.filter((r) => r.resolved);
  // We can only generate Cursor deep-links for plugins that have MCP config. Since
  // we don't carry mcp config on the ProfilePluginRef, show the CLI path here.
  if (mcpPlugins.length === 0) {
    return (
      <p className="text-sm text-fd-muted-foreground">
        No plugins in this profile expose MCP servers. Use the npx / CLI tab to apply this profile.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fd-muted-foreground">
        For plugins in this profile that include MCP servers, use their individual install pages for
        one-click Cursor deep-links. Or use the npx / CLI tab to apply the full profile at once.
      </p>
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────

type InstallWidgetProps =
  | { kind: 'plugin'; plugin: MarketplacePlugin }
  | { kind: 'profile'; profile: MarketplaceProfile };

export function InstallWidget(props: InstallWidgetProps) {
  // Profiles default to the Harness CLI (the only true one-shot path); plugins to Claude Code.
  const [tab, setTab] = useState<Tab>(props.kind === 'profile' ? 'cli' : 'claude');

  const hasMcp = props.kind === 'plugin' ? Boolean(props.plugin.mcp) : false;
  const tabs = props.kind === 'profile' ? PROFILE_TABS : PLUGIN_TABS;
  const visibleTabs = tabs.filter((t) => t.id !== 'cursor' || hasMcp || props.kind === 'profile');

  const chip = (active: boolean) =>
    `cursor-pointer rounded-full px-3 py-1 text-sm font-medium transition-colors ${
      active
        ? 'bg-fd-primary/15 text-fd-foreground'
        : 'bg-fd-card/60 text-fd-muted-foreground hover:bg-fd-card hover:text-fd-foreground'
    }`;

  return (
    <div>
      {/* Tab bar */}
      <div className="mb-4 flex flex-wrap gap-2">
        {visibleTabs.map((t) => (
          <button key={t.id} type="button" className={chip(tab === t.id)} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab === 'claude' && (
          props.kind === 'plugin'
            ? <PluginClaudeTab plugin={props.plugin} />
            : <ProfileClaudeTab profile={props.profile} />
        )}
        {tab === 'cli' && (
          props.kind === 'plugin'
            ? <PluginCliTab plugin={props.plugin} />
            : <ProfileCliTab profile={props.profile} />
        )}
        {tab === 'cursor' && (
          props.kind === 'plugin'
            ? <PluginCursorTab plugin={props.plugin} />
            : <ProfileCursorTab profile={props.profile} />
        )}
      </div>
    </div>
  );
}
