const AGENTS = [
  { name: 'Claude Code', abbr: 'CC' },
  { name: 'Cursor', abbr: 'CUR' },
  { name: 'GitHub Copilot', abbr: 'COP' },
  { name: 'Codex CLI', abbr: 'CDX' },
  { name: 'Gemini CLI', abbr: 'GEM' },
] as const;

/**
 * A static row of supported AI coding agent badges — signals cross-platform
 * compatibility to engineers evaluating the marketplace.
 */
export function SupportedAgents() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <span className="mr-1 text-xs text-fd-muted-foreground">Works with</span>
      {AGENTS.map((agent) => (
        <span
          key={agent.name}
          className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium text-fd-muted-foreground transition-colors"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid color-mix(in srgb, var(--fg-subtle) 20%, transparent)',
          }}
          title={agent.name}
        >
          {agent.name}
        </span>
      ))}
    </div>
  );
}
