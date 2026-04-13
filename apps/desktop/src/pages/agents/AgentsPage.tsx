import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

// ── Types ────────────────────────────────────────────────────

export interface AgentInfo {
  id: string;
  name: string;
  binary: string;
  installed: boolean;
  version: string | null;
  protocol: "stdio" | "http";
  description: string;
  addToComparator: boolean;
}

// ── Design tokens (matches app-wide CSS vars) ────────────────

const tokens = {
  bgBase: "var(--bg-base)",
  bgSurface: "var(--bg-surface)",
  bgElevated: "var(--bg-elevated)",
  fgBase: "var(--fg-base)",
  fgMuted: "var(--fg-muted)",
  fgSubtle: "var(--fg-subtle)",
  borderBase: "var(--border-base)",
  borderSubtle: "var(--border-subtle)",
  accent: "var(--accent)",
  accentFg: "var(--accent-fg)",
  success: "var(--success)",
  danger: "var(--danger)",
};

const fontStack = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';

// ── Install docs URLs per agent id ──────────────────────────

const INSTALL_DOCS: Record<string, string> = {
  claude: "https://docs.anthropic.com/claude-code",
  codex: "https://github.com/openai/codex",
  copilot:
    "https://docs.github.com/copilot/using-github-copilot/using-github-copilot-in-the-command-line",
  "cursor-agent": "https://www.cursor.com/downloads",
  opencode: "https://opencode.ai",
  goose: "https://github.com/block/goose",
  gemini: "https://github.com/google-gemini/gemini-cli",
  aider: "https://aider.chat/docs/install.html",
  "amazon-q": "https://aws.amazon.com/q/developer",
  warp: "https://www.warp.dev",
  "open-interpreter": "https://docs.openinterpreter.com/getting-started/setup",
  cline: "https://github.com/cline/cline",
  forge: "https://forgecode.dev",
  qwen: "https://github.com/QwenLM/qwen-code",
};

// ── Skeleton loader ──────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      style={{
        background: tokens.bgSurface,
        border: `1px solid ${tokens.borderSubtle}`,
        borderRadius: "10px",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      {[100, 60, 80].map((w, i) => (
        <div
          key={i}
          style={{
            height: i === 0 ? "16px" : "12px",
            width: `${w}%`,
            background: tokens.borderBase,
            borderRadius: "4px",
            opacity: 0.5,
          }}
        />
      ))}
    </div>
  );
}

// ── Agent card ───────────────────────────────────────────────

function AgentCard({
  agent,
  onAddToComparator,
}: {
  agent: AgentInfo;
  onAddToComparator: (id: string) => void;
}) {
  const docsUrl = INSTALL_DOCS[agent.id];

  return (
    <div
      data-testid="agent-card"
      data-agent-id={agent.id}
      style={{
        background: tokens.bgSurface,
        border: `1px solid ${agent.installed ? tokens.borderBase : tokens.borderSubtle}`,
        borderRadius: "10px",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        fontFamily: fontStack,
        opacity: agent.installed ? 1 : 0.75,
        transition: "border-color 150ms ease",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "8px",
        }}
      >
        <div>
          <div
            style={{ fontSize: "14px", fontWeight: 600, color: tokens.fgBase, marginBottom: "3px" }}
          >
            {agent.name}
          </div>
          <div style={{ fontSize: "12px", color: tokens.fgMuted, fontFamily: "monospace" }}>
            {agent.binary}
          </div>
        </div>

        {/* Protocol badge */}
        <span
          data-testid="protocol-badge"
          style={{
            fontSize: "10px",
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            padding: "2px 7px",
            borderRadius: "8px",
            background: agent.protocol === "http" ? "rgba(37,99,235,0.12)" : "rgba(91,80,232,0.12)",
            color: agent.protocol === "http" ? "#2563eb" : tokens.accent,
            border: `1px solid ${agent.protocol === "http" ? "rgba(37,99,235,0.2)" : "rgba(91,80,232,0.2)"}`,
            flexShrink: 0,
          }}
        >
          {agent.protocol}
        </span>
      </div>

      {/* Description */}
      <div style={{ fontSize: "12px", color: tokens.fgMuted, lineHeight: 1.5 }}>
        {agent.description}
      </div>

      {/* Status + actions */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          marginTop: "auto",
        }}
      >
        {agent.installed ? (
          <span
            data-testid="installed-badge"
            style={{
              fontSize: "11px",
              fontWeight: 500,
              padding: "3px 9px",
              borderRadius: "8px",
              background: "rgba(22,163,74,0.1)",
              border: "1px solid rgba(22,163,74,0.25)",
              color: tokens.success,
            }}
          >
            {agent.version ? `Installed ${agent.version}` : "Installed"}
          </span>
        ) : (
          <span
            data-testid="not-found-badge"
            style={{
              fontSize: "11px",
              fontWeight: 500,
              padding: "3px 9px",
              borderRadius: "8px",
              background: "rgba(220,38,38,0.08)",
              border: "1px solid rgba(220,38,38,0.2)",
              color: tokens.danger,
            }}
          >
            Not found
          </span>
        )}

        <div style={{ display: "flex", gap: "6px" }}>
          {!agent.installed && docsUrl && (
            <a
              href={docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: "11px",
                color: tokens.accent,
                textDecoration: "none",
                padding: "3px 9px",
                borderRadius: "6px",
                border: `1px solid ${tokens.borderBase}`,
                background: tokens.bgElevated,
              }}
            >
              How to install
            </a>
          )}

          <button
            data-testid="add-to-comparator-btn"
            disabled={!agent.addToComparator}
            onClick={() => onAddToComparator(agent.id)}
            style={{
              fontSize: "11px",
              fontWeight: 500,
              padding: "3px 9px",
              borderRadius: "6px",
              border: `1px solid ${agent.addToComparator ? tokens.accent : tokens.borderSubtle}`,
              background: agent.addToComparator ? "rgba(91,80,232,0.1)" : tokens.bgElevated,
              color: agent.addToComparator ? tokens.accent : tokens.fgSubtle,
              cursor: agent.addToComparator ? "pointer" : "not-allowed",
              opacity: agent.addToComparator ? 1 : 0.5,
            }}
          >
            Add to Comparator
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<AgentInfo[]>("detect_agents")
      .then(setAgents)
      .catch((e) => setError(String(e)));
  }, []);

  function handleAddToComparator(id: string) {
    // Mark the agent as no longer addable (prevents double-clicks)
    setAgents((prev) =>
      prev ? prev.map((a) => (a.id === id ? { ...a, addToComparator: false } : a)) : prev,
    );
  }

  const installedCount = agents ? agents.filter((a) => a.installed).length : 0;

  return (
    <div
      style={{
        padding: "32px",
        maxWidth: "1100px",
        fontFamily: fontStack,
        color: tokens.fgBase,
      }}
    >
      {/* Page header */}
      <div style={{ marginBottom: "28px" }}>
        <h1
          style={{
            margin: 0,
            fontSize: "22px",
            fontWeight: 700,
            color: tokens.fgBase,
            letterSpacing: "-0.02em",
          }}
        >
          Agents
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: "14px", color: tokens.fgMuted }}>
          {agents
            ? `${installedCount} of ${agents.length} agents detected on this machine`
            : "Detecting installed CLI agents…"}
        </p>
      </div>

      {/* Error state */}
      {error && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "8px",
            background: "rgba(220,38,38,0.08)",
            border: "1px solid rgba(220,38,38,0.2)",
            color: tokens.danger,
            fontSize: "13px",
            marginBottom: "24px",
          }}
        >
          Failed to detect agents: {error}
        </div>
      )}

      {/* Grid — skeleton while loading, cards when ready */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: "16px",
        }}
      >
        {agents === null && !error
          ? Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />)
          : agents?.map((agent) => (
              <AgentCard key={agent.id} agent={agent} onAddToComparator={handleAddToComparator} />
            ))}
      </div>
    </div>
  );
}
