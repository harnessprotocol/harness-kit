const SOURCES = [
  { id: 'claude-code', label: 'Claude Code', file: '~/.claude/', y: 30 },
  { id: 'cursor', label: 'Cursor', file: '.cursor/rules', y: 78 },
  { id: 'copilot', label: 'Copilot', file: '.github/copilot-instructions.md', y: 126 },
  { id: 'opencode', label: 'opencode', file: '.opencode/', y: 174 },
  { id: 'pi', label: 'pi', file: '.pi/', y: 222 },
  { id: 'agents-md', label: 'AGENTS.md family', file: 'AGENTS.md', y: 270 },
];

const CENTER_Y = (30 + 270) / 2; // 150 — vertical midpoint of the source stack

/**
 * The sprawl-reveal: N native tool configs already on disk, converging into
 * one harness.yaml. Mirrors the desktop onboarding "convergence map" concept
 * (DESIGN.md §6, Onboarding step 3) — schematic, not heavy, no gimmick
 * animation beyond a slow opacity pulse on the merge point.
 */
export function SprawlReveal() {
  return (
    <div className="mx-auto max-w-4xl">
      <svg
        viewBox="0 0 720 300"
        className="w-full"
        role="img"
        aria-label="Six AI tool configuration files converging into one harness.yaml"
      >
        {/* Convergence lines */}
        <g fill="none" stroke="var(--border-strong)" strokeWidth="1.5">
          {SOURCES.map((s) => (
            <path
              key={s.id}
              d={`M 210 ${s.y} C 340 ${s.y}, 340 ${CENTER_Y}, 460 ${CENTER_Y}`}
              opacity="0.7"
            />
          ))}
        </g>

        {/* Source chips */}
        {SOURCES.map((s) => (
          <g key={s.id}>
            <rect
              x="10"
              y={s.y - 18}
              width="200"
              height="36"
              rx="8"
              fill="var(--bg-surface)"
              style={{ filter: 'drop-shadow(var(--shadow-sm))' }}
            />
            <circle cx="30" cy={s.y} r="4" fill="var(--fg-subtle)" />
            <text x="42" y={s.y - 3} fontSize="11" fontWeight="600" fill="var(--fg-base)">
              {s.label}
            </text>
            <text
              x="42"
              y={s.y + 11}
              fontSize="9.5"
              fill="var(--fg-subtle)"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            >
              {s.file}
            </text>
          </g>
        ))}

        {/* Merge point */}
        <circle cx="460" cy={CENTER_Y} r="3" fill="var(--accent)" />

        {/* harness.yaml card */}
        <g>
          <rect
            x="490"
            y={CENTER_Y - 66}
            width="220"
            height="132"
            rx="12"
            fill="var(--bg-elevated)"
            stroke="var(--accent)"
            strokeOpacity="0.35"
            style={{ filter: 'drop-shadow(var(--shadow-md))' }}
          />
          <text
            x="510"
            y={CENTER_Y - 36}
            fontSize="13"
            fontWeight="700"
            fill="var(--accent-text)"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          >
            harness.yaml
          </text>
          <g fontSize="10.5" fill="var(--fg-muted)" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
            <text x="510" y={CENTER_Y - 12}>plugins: 7</text>
            <text x="510" y={CENTER_Y + 8}>mcp-servers: 4</text>
            <text x="510" y={CENTER_Y + 28}>instructions: reconciled</text>
            <text x="510" y={CENTER_Y + 48}>permissions: unified</text>
          </g>
        </g>
      </svg>
    </div>
  );
}
