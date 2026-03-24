import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  runParityScan,
  getParitySnapshot,
  getParityDrift,
  acknowledgeDrift,
  createConfigFile,
  addToParityBaseline,
} from "../../lib/tauri";
import type { ParitySnapshot, ParityFeature, ParityDriftItem } from "../../lib/tauri";

// ── Helpers ──────────────────────────────────────────────────

function relativeTime(isoString: string): string {
  const ms = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function isOlderThan24h(isoString: string): boolean {
  return Date.now() - new Date(isoString).getTime() > 24 * 60 * 60 * 1000;
}

const CATEGORY_LABELS: Record<string, string> = {
  config_file: "Config Files",
  settings_key: "Settings Keys",
  cli_flag: "CLI Flags",
  cli_subcommand: "CLI Subcommands",
  mcp_transport: "MCP Transports",
  mcp_server: "MCP Servers",
  plugin_type: "Plugin Component Types",
};

const CATEGORY_ORDER = [
  "config_file",
  "settings_key",
  "cli_flag",
  "cli_subcommand",
  "mcp_transport",
  "mcp_server",
  "plugin_type",
];

const CATEGORY_COLORS: Record<string, string> = {
  settings_key: "#0d9488",
  cli_flag: "#2563eb",
  mcp_transport: "#7c3aed",
  plugin_type: "#ea580c",
  config_file: "#16a34a",
  mcp_server: "#64748b",
  cli_subcommand: "#64748b",
};

// ── Descriptions ─────────────────────────────────────────────

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  config_file:
    "Standard configuration files Claude Code reads automatically when present in ~/ or project directories.",
  settings_key:
    "Keys found in ~/.claude/settings.json and settings.local.json — controls permissions, tools, and behavior.",
  cli_flag: "Command-line flags detected from `claude --help` output.",
  cli_subcommand:
    "Subcommands available in the Claude Code CLI (informational, not tracked for drift).",
  mcp_transport: "Transport protocols used by your configured MCP servers.",
  mcp_server: "MCP servers configured in ~/.claude/mcp.json (informational).",
  plugin_type: "Plugin component types found across your installed Claude Code plugins.",
};

const FEATURE_DESCRIPTIONS: Record<string, Record<string, string>> = {
  config_file: {
    "CLAUDE.md":
      "Operational instructions — build commands, architecture notes, and gotchas. Auto-loaded per project up the directory tree.",
    "AGENT.md":
      "Behavioral instructions — tone, autonomy level, and workflow conventions. Cascades from global to project.",
    "SOUL.md":
      "Identity file — values, relationship context, and memory bootstrap. Global scope only.",
    ".mcp.json": "Project-level MCP server definitions — tool providers for Claude Code.",
    ".claude/settings.json":
      "Claude Code settings — permissions, allowed/denied tools, env vars, and model preferences.",
    ".claude/settings.local.json":
      "Local overrides for settings.json — not committed to git, for machine-specific config.",
    ".claude/hooks/":
      "Directory for hook scripts — PreToolUse, PostToolUse, Stop, and other lifecycle events.",
  },
  settings_key: {
    permissions: "Root container for all permission settings (allow/deny/ask).",
    "permissions.allow":
      "Tool patterns Claude may use without asking. Supports glob syntax, e.g. 'Bash(npm *)'.",
    "permissions.deny": "Tool patterns Claude is never allowed to use.",
    "permissions.ask": "Tool patterns that require explicit approval each time.",
    additionalDirectories:
      "Directories outside the project root that Claude has read/write access to.",
    model: "Override the default Claude model for this project.",
    apiKeyHelper: "Shell command to dynamically fetch the Anthropic API key.",
    cleanupPeriodDays: "Days to retain conversation history before automatic cleanup.",
    env: "Environment variables set for all Claude Code sessions in this project.",
    includeCoAuthoredBy: "Whether to include the Co-Authored-By trailer in git commits.",
    hooks: "Lifecycle hook configuration — maps events to shell commands.",
    theme: "UI theme override: 'dark', 'light', or 'auto'.",
  },
  cli_flag: {
    "--version": "Print the current installed version of Claude Code and exit.",
    "--help": "Show usage information, available flags, and subcommands.",
    "-p": "Non-interactive print mode — pipe in a prompt, get output without a TTY.",
    "--print": "Alias for -p — non-interactive print mode.",
    "--model": "Override the Claude model for this session (e.g. claude-opus-4-6).",
    "--resume": "Resume a previous conversation by session ID.",
    "--continue": "Continue the most recent conversation.",
    "--dangerously-skip-permissions":
      "Skip all permission checks — for trusted automated environments only.",
    "--output-format": "Set output format: text, json, or stream-json.",
    "--max-turns": "Limit agentic turns (tool calls) in a single session.",
    "--allowedTools": "Comma-separated list of tools to enable for this session.",
    "--disallowedTools": "Comma-separated list of tools to disable for this session.",
    "--verbose": "Enable verbose output for debugging.",
    "--debug": "Enable debug mode with extra logging.",
    "--no-color": "Disable ANSI color output.",
    "--add-dir": "Add extra working directories for this session.",
    "--system-prompt": "Override the system prompt (use with -p).",
  },
  mcp_transport: {
    stdio: "The MCP server runs as a subprocess communicating via stdin/stdout.",
    http: "The MCP server runs as a web service, queried over HTTP.",
    sse: "The MCP server streams events over an HTTP connection (Server-Sent Events).",
    ws: "Bidirectional streaming communication with the MCP server (WebSocket).",
  },
  plugin_type: {
    skills: "Prompt-based SKILL.md files that teach Claude how to perform specific tasks.",
    agents: "Specialist subagent configurations for delegated autonomous tasks.",
    hooks: "Lifecycle hook scripts triggered by events (PreToolUse, PostToolUse, etc.).",
    commands: "Custom slash commands users can invoke in the Claude Code UI.",
    scripts: "Bundled utility scripts shipped with the plugin.",
  },
};

function getFeatureDescription(category: string, featureName: string): string {
  const specific = FEATURE_DESCRIPTIONS[category]?.[featureName];
  if (specific) return specific;
  // Fallback by category + name patterns
  if (category === "settings_key") {
    if (featureName.startsWith("permissions.")) return `Permission setting: controls ${featureName.split(".").slice(1).join(".")} access.`;
    if (featureName.startsWith("hooks.")) return `Hook config for the ${featureName.split(".").slice(1).join(".")} event.`;
    if (featureName.startsWith("env.")) return `Environment variable: ${featureName.split(".").slice(1).join(".")}.`;
    return "Settings key found in ~/.claude/settings.json.";
  }
  if (category === "cli_flag") return "Command-line flag for the Claude Code CLI.";
  if (category === "cli_subcommand") return "Claude Code CLI subcommand.";
  if (category === "mcp_server") return "MCP server configured in ~/.claude/mcp.json.";
  if (category === "mcp_transport") return "MCP transport protocol used by a configured server.";
  if (category === "config_file") return "Configuration file read by Claude Code.";
  if (category === "plugin_type") return "Plugin component type.";
  return "";
}

const CONFIG_FILE_TEMPLATES: Record<string, string> = {
  "CLAUDE.md":
    "# Global Instructions\n\n## Commands\n\n<!-- build, test, dev commands -->\n\n## Architecture\n\n<!-- entry points, package layout, key files -->\n\n## Gotchas\n\n<!-- non-obvious patterns and common mistakes -->",
  "AGENT.md":
    "# Behavioral Configuration\n\n## Tone\n\nDirect and concise. No filler words.\n\n## Autonomy\n\nAsk before destructive or hard-to-reverse operations.\n\n## Workflow\n\nWork in focused sessions. Commit changes incrementally.",
  "SOUL.md":
    "# Identity\n\n## Values\n\n<!-- Your collaboration values and preferences -->\n\n## Relationship Context\n\n<!-- How you prefer to work with Claude across sessions -->",
  ".mcp.json": '{\n  "mcpServers": {}\n}',
  ".claude/settings.json": '{\n  "permissions": {\n    "allow": [],\n    "deny": []\n  }\n}',
};

const DRIFT_DESCRIPTIONS: Record<
  string,
  (item: ParityDriftItem) => string
> = {
  missing_file: (item) => {
    const cfg = FEATURE_DESCRIPTIONS.config_file[item.featureName];
    return cfg
      ? `${item.featureName} is missing from its expected location. ${cfg}`
      : `${item.featureName} was not found. This file is used by Claude Code.`;
  },
  new_feature: (item) => {
    switch (item.category) {
      case "settings_key":
        return `The key "${item.featureName}" is in your ~/.claude/settings.json but isn't tracked in Harness Kit's baseline. If you use this intentionally, mark it as known to stop flagging it.`;
      case "cli_flag":
        return `The flag "${item.featureName}" appears in \`claude --help\` but isn't in Harness Kit's baseline. It may be a new Claude Code feature.`;
      case "mcp_transport":
        return `The MCP transport "${item.featureName}" is in use but isn't in Harness Kit's baseline.`;
      case "plugin_type":
        return `Plugin component type "${item.featureName}" was found but isn't in Harness Kit's baseline.`;
      default:
        return item.details ?? "Untracked feature detected.";
    }
  },
};

// ── Stat card ────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: "var(--bg-surface)",
        border: `1px solid ${accent ? "var(--accent)" : "var(--border-base)"}`,
        borderRadius: "8px",
        padding: "12px 16px",
      }}
    >
      <div
        style={{
          fontSize: "20px",
          fontWeight: 600,
          letterSpacing: "-0.5px",
          color: accent ? "var(--accent)" : "var(--fg-base)",
          lineHeight: 1.1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div style={{ marginTop: "4px" }}>
        <span
          style={{
            fontSize: "11px",
            fontWeight: 500,
            fontVariantCaps: "all-small-caps",
            letterSpacing: "0.03em",
            color: "var(--fg-subtle)",
          }}
        >
          {label}
        </span>
      </div>
      {sub && (
        <div
          style={{
            marginTop: "3px",
            fontSize: "10px",
            color: "var(--fg-subtle)",
            opacity: 0.7,
            lineHeight: 1.35,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Status badge ─────────────────────────────────────────────

function StatusBadge({ status }: { status: "ok" | "new" | "not_found" | "info" }) {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    ok: { bg: "rgba(22,163,74,0.12)", color: "#16a34a", label: "OK" },
    new: { bg: "rgba(245,158,11,0.12)", color: "#d97706", label: "New" },
    not_found: { bg: "rgba(100,116,139,0.10)", color: "var(--fg-subtle)", label: "Not found" },
    info: { bg: "rgba(100,116,139,0.10)", color: "var(--fg-subtle)", label: "Info" },
  };
  const s = styles[status];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 7px",
        borderRadius: "10px",
        fontSize: "10px",
        fontWeight: 600,
        background: s.bg,
        color: s.color,
        letterSpacing: "0.02em",
      }}
    >
      {s.label}
    </span>
  );
}

function featureStatus(feature: ParityFeature): "ok" | "new" | "not_found" | "info" {
  if (feature.category === "config_file") {
    if (feature.value === "detected") return feature.knownToHarness ? "ok" : "new";
    return "not_found";
  }
  if (feature.category === "mcp_server" || feature.category === "cli_subcommand") return "info";
  return feature.knownToHarness ? "ok" : "new";
}

// ── Feature matrix section ───────────────────────────────────

function FeatureSection({
  category,
  features,
}: {
  category: string;
  features: ParityFeature[];
}) {
  const [open, setOpen] = useState(true);
  const label = CATEGORY_LABELS[category] ?? category;
  const categoryDesc = CATEGORY_DESCRIPTIONS[category] ?? "";
  const newCount = features.filter((f) => featureStatus(f) === "new").length;

  return (
    <div
      style={{
        border: "1px solid var(--border-base)",
        borderRadius: "8px",
        overflow: "hidden",
        marginBottom: "8px",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        title={categoryDesc}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 14px",
          background: "var(--bg-surface)",
          border: "none",
          cursor: "pointer",
          color: "var(--fg-base)",
          fontSize: "12px",
          fontWeight: 600,
          textAlign: "left",
        }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="currentColor"
          style={{
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
            color: "var(--fg-subtle)",
            flexShrink: 0,
          }}
        >
          <path d="M3 2l4 3-4 3V2z" />
        </svg>
        <span style={{ flex: 1 }}>{label}</span>
        <span style={{ color: "var(--fg-subtle)", fontWeight: 400, fontSize: "11px" }}>
          {features.length} {features.length === 1 ? "item" : "items"}
        </span>
        {newCount > 0 && (
          <span
            style={{
              padding: "1px 7px",
              borderRadius: "10px",
              fontSize: "10px",
              fontWeight: 600,
              background: "rgba(245,158,11,0.12)",
              color: "#d97706",
            }}
          >
            {newCount} new
          </span>
        )}
      </button>

      {open && (
        <div style={{ borderTop: "1px solid var(--border-base)" }}>
          {features.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: "12px", color: "var(--fg-subtle)" }}>
              No items detected
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ background: "var(--bg-base)" }}>
                  <th
                    style={{
                      padding: "6px 14px",
                      textAlign: "left",
                      fontWeight: 500,
                      color: "var(--fg-subtle)",
                      fontSize: "10px",
                      fontVariantCaps: "all-small-caps",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Name
                  </th>
                  <th
                    style={{
                      padding: "6px 14px",
                      textAlign: "left",
                      fontWeight: 500,
                      color: "var(--fg-subtle)",
                      fontSize: "10px",
                      fontVariantCaps: "all-small-caps",
                      letterSpacing: "0.05em",
                      width: "120px",
                    }}
                  >
                    Harness Support
                  </th>
                  <th
                    style={{
                      padding: "6px 14px",
                      textAlign: "left",
                      fontWeight: 500,
                      color: "var(--fg-subtle)",
                      fontSize: "10px",
                      fontVariantCaps: "all-small-caps",
                      letterSpacing: "0.05em",
                      width: "100px",
                    }}
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {features.map((feature, idx) => {
                  const desc = getFeatureDescription(feature.category, feature.name);
                  return (
                    <tr
                      key={feature.name}
                      style={{ borderTop: idx === 0 ? "none" : "1px solid var(--separator)" }}
                    >
                      <td
                        style={{
                          padding: "7px 14px",
                          color: "var(--fg-base)",
                          fontFamily: "monospace",
                          fontSize: "11px",
                        }}
                      >
                        <span
                          title={desc || undefined}
                          style={{
                            borderBottom: desc ? "1px dotted var(--fg-subtle)" : "none",
                            cursor: desc ? "help" : "default",
                          }}
                        >
                          {feature.name}
                        </span>
                      </td>
                      <td style={{ padding: "7px 14px", color: "var(--fg-subtle)" }}>
                        {feature.knownToHarness ? "Tracked" : "—"}
                      </td>
                      <td style={{ padding: "7px 14px" }}>
                        <StatusBadge status={featureStatus(feature)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ── Action button ─────────────────────────────────────────────

function ActionButton({
  label,
  primary,
  onClick,
  loading,
}: {
  label: string;
  primary?: boolean;
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        padding: "5px 12px",
        borderRadius: "5px",
        border: primary ? "none" : "1px solid var(--border-base)",
        background: primary ? "var(--accent)" : "transparent",
        color: primary ? "white" : "var(--fg-base)",
        fontSize: "11px",
        fontWeight: primary ? 500 : 400,
        cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? "…" : label}
    </button>
  );
}

// ── Drift alert row ───────────────────────────────────────────

function DriftRow({
  item,
  onAcknowledge,
  onRescan,
}: {
  item: ParityDriftItem;
  onAcknowledge: (id: number) => void;
  onRescan: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const navigate = useNavigate();

  const color = CATEGORY_COLORS[item.category] ?? "#64748b";

  const descFn = DRIFT_DESCRIPTIONS[item.driftType];
  const description = descFn ? descFn(item) : (item.details ?? "");

  const template = item.driftType === "missing_file"
    ? CONFIG_FILE_TEMPLATES[item.featureName]
    : null;

  async function runAction(label: string, fn: () => Promise<void>) {
    setActionLoading(label);
    setActionError(null);
    try {
      await fn();
      onRescan();
    } catch (err) {
      setActionError(String(err));
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div
      style={{
        borderBottom: "1px solid var(--separator)",
        opacity: item.acknowledged ? 0.45 : 1,
      }}
    >
      {/* Summary row */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "10px 14px",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          fill="currentColor"
          style={{
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.12s ease",
            color: "var(--fg-subtle)",
            flexShrink: 0,
          }}
        >
          <path d="M2 1l4 3-4 3V1z" />
        </svg>

        <span
          style={{
            display: "inline-block",
            padding: "2px 8px",
            borderRadius: "10px",
            fontSize: "10px",
            fontWeight: 600,
            background: `${color}18`,
            color,
            flexShrink: 0,
          }}
        >
          {CATEGORY_LABELS[item.category] ?? item.category}
        </span>

        <span
          style={{
            flex: 1,
            fontSize: "12px",
            fontWeight: 600,
            color: "var(--fg-base)",
            fontFamily: "monospace",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.featureName}
        </span>

        <span style={{ fontSize: "11px", color: "var(--fg-subtle)", flexShrink: 0 }}>
          {relativeTime(item.detectedAt)}
        </span>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div
          style={{
            margin: "0 14px 14px 30px",
            borderLeft: `2px solid ${color}30`,
            paddingLeft: "14px",
          }}
        >
          {/* Description */}
          <p style={{ margin: "0 0 12px", fontSize: "12px", color: "var(--fg-subtle)", lineHeight: 1.5 }}>
            {description}
          </p>

          {/* Template preview for missing files */}
          {template && (
            <pre
              style={{
                margin: "0 0 12px",
                padding: "10px 12px",
                background: "var(--bg-base)",
                border: "1px solid var(--border-base)",
                borderRadius: "6px",
                fontSize: "10px",
                color: "var(--fg-subtle)",
                lineHeight: 1.5,
                overflow: "auto",
                maxHeight: "100px",
                whiteSpace: "pre-wrap",
              }}
            >
              {template}
            </pre>
          )}

          {/* Action error */}
          {actionError && (
            <div
              style={{
                padding: "6px 10px",
                marginBottom: "10px",
                borderRadius: "5px",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.2)",
                color: "#dc2626",
                fontSize: "11px",
              }}
            >
              {actionError}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            {/* missing_file → Create File */}
            {item.driftType === "missing_file" && (
              <ActionButton
                label={`Create ${item.featureName}`}
                primary
                loading={actionLoading === "create"}
                onClick={() =>
                  runAction("create", () => createConfigFile(item.featureName).then(() => {}))
                }
              />
            )}

            {/* new_feature → Mark as Known */}
            {item.driftType === "new_feature" && (
              <ActionButton
                label="Mark as Known"
                primary
                loading={actionLoading === "baseline"}
                onClick={() =>
                  runAction("baseline", () =>
                    addToParityBaseline(item.category, item.featureName)
                  )
                }
              />
            )}

            {/* settings_key → navigate to Security page for editing */}
            {item.driftType === "new_feature" && item.category === "settings_key" && (
              <ActionButton
                label="Edit in Security →"
                onClick={() => navigate("/security/permissions")}
              />
            )}

            {/* Acknowledge */}
            {!item.acknowledged && (
              <button
                onClick={() => onAcknowledge(item.id)}
                title="Mark as acknowledged — will be pre-acknowledged on future scans unless the item changes."
                style={{
                  marginLeft: "auto",
                  padding: "4px 10px",
                  borderRadius: "5px",
                  border: "1px solid var(--border-base)",
                  background: "transparent",
                  color: "var(--fg-subtle)",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
              >
                Acknowledge
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────

export default function ParityDashboardPage() {
  const [snapshot, setSnapshot] = useState<ParitySnapshot | null>(null);
  const [driftItems, setDriftItems] = useState<ParityDriftItem[]>([]);
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [snap, drift] = await Promise.all([getParitySnapshot(), getParityDrift(false)]);
      setSnapshot(snap);
      setDriftItems(drift);
      return snap;
    } catch (err) {
      setError(String(err));
      return null;
    }
  }, []);

  const triggerScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      await runParityScan();
      await loadData();
    } catch (err) {
      setError(String(err));
    } finally {
      setScanning(false);
    }
  }, [loadData]);

  useEffect(() => {
    loadData().then((snap) => {
      if (!snap || isOlderThan24h(snap.timestamp)) triggerScan();
    });
  }, [loadData, triggerScan]);

  const handleAcknowledge = useCallback(async (driftId: number) => {
    try {
      await acknowledgeDrift(driftId);
      setDriftItems((prev) => prev.filter((d) => d.id !== driftId));
    } catch (err) {
      setError(String(err));
    }
  }, []);

  const handleShowAcknowledged = useCallback(async () => {
    const next = !showAcknowledged;
    setShowAcknowledged(next);
    try {
      const drift = await getParityDrift(next);
      setDriftItems(drift);
    } catch (err) {
      setError(String(err));
    }
  }, [showAcknowledged]);

  const ccVersion = snapshot?.ccVersion ?? null;
  const ccInstalled = snapshot?.ccInstalled ?? false;
  const lastScan = snapshot?.timestamp ?? null;
  const totalFeatures = snapshot
    ? Object.values(snapshot.categories).reduce((sum, arr) => sum + arr.length, 0)
    : 0;
  const activeDrift = driftItems.filter((d) => !d.acknowledged).length;

  const driftBreakdown = driftItems
    .filter((d) => !d.acknowledged)
    .reduce(
      (acc, d) => { acc[d.category] = (acc[d.category] || 0) + 1; return acc; },
      {} as Record<string, number>,
    );
  const driftBreakdownStr =
    activeDrift > 0
      ? Object.entries(driftBreakdown)
          .map(([cat, n]) => `${n} ${CATEGORY_LABELS[cat] ?? cat}`)
          .join(" · ")
      : undefined;

  const orderedCategories = CATEGORY_ORDER.filter(
    (cat) => snapshot?.categories[cat] && snapshot.categories[cat].length > 0,
  );

  return (
    <div style={{ padding: "24px", maxWidth: "900px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "20px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "var(--fg-base)" }}>
            Parity
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--fg-subtle)" }}>
            Track Claude Code feature parity with Harness Kit
          </p>
        </div>
        <button
          onClick={triggerScan}
          disabled={scanning}
          style={{
            padding: "7px 14px",
            borderRadius: "6px",
            border: "1px solid var(--border-base)",
            background: scanning ? "var(--bg-surface)" : "var(--accent)",
            color: scanning ? "var(--fg-subtle)" : "white",
            fontSize: "12px",
            fontWeight: 500,
            cursor: scanning ? "not-allowed" : "pointer",
            opacity: scanning ? 0.7 : 1,
          }}
        >
          {scanning ? "Scanning…" : "Scan Now"}
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "6px",
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            color: "#dc2626",
            fontSize: "12px",
            marginBottom: "16px",
          }}
        >
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "24px" }}>
        <StatCard
          label="Claude Code"
          value={ccInstalled ? (ccVersion ?? "Installed") : "Not installed"}
          sub={ccInstalled ? "installed" : undefined}
        />
        <StatCard
          label="Last Scan"
          value={lastScan ? relativeTime(lastScan) : "Never"}
          sub={lastScan ? new Date(lastScan).toLocaleDateString() : undefined}
        />
        <StatCard label="Features Detected" value={scanning ? "…" : String(totalFeatures)} />
        <StatCard
          label="Drift Items"
          value={scanning ? "…" : String(activeDrift)}
          sub={driftBreakdownStr}
          accent={activeDrift > 0}
        />
      </div>

      {/* Feature matrix */}
      <div style={{ marginBottom: "24px" }}>
        <h2
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "var(--fg-subtle)",
            margin: "0 0 10px",
            fontVariantCaps: "all-small-caps",
            letterSpacing: "0.05em",
          }}
        >
          Feature Matrix
        </h2>

        {!snapshot && !scanning && (
          <div
            style={{
              padding: "24px",
              textAlign: "center",
              color: "var(--fg-subtle)",
              fontSize: "12px",
              border: "1px solid var(--border-base)",
              borderRadius: "8px",
            }}
          >
            No scan data yet. Click "Scan Now" to detect Claude Code features.
          </div>
        )}

        {scanning && !snapshot && (
          <div
            style={{
              padding: "24px",
              textAlign: "center",
              color: "var(--fg-subtle)",
              fontSize: "12px",
              border: "1px solid var(--border-base)",
              borderRadius: "8px",
            }}
          >
            Scanning…
          </div>
        )}

        {snapshot &&
          orderedCategories.map((cat) => (
            <FeatureSection
              key={cat}
              category={cat}
              features={snapshot.categories[cat] ?? []}
            />
          ))}
      </div>

      {/* Drift alerts */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "10px",
          }}
        >
          <h2
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--fg-subtle)",
              margin: 0,
              fontVariantCaps: "all-small-caps",
              letterSpacing: "0.05em",
            }}
          >
            Drift Alerts
          </h2>
          <button
            onClick={handleShowAcknowledged}
            style={{
              background: "transparent",
              border: "none",
              fontSize: "11px",
              color: "var(--fg-subtle)",
              cursor: "pointer",
              padding: "2px 4px",
            }}
          >
            {showAcknowledged ? "Hide acknowledged" : "Show acknowledged"}
          </button>
        </div>

        <div
          style={{
            border: "1px solid var(--border-base)",
            borderRadius: "8px",
            overflow: "hidden",
            background: "var(--bg-surface)",
          }}
        >
          {driftItems.length === 0 ? (
            <div
              style={{
                padding: "20px 14px",
                textAlign: "center",
                color: "var(--fg-subtle)",
                fontSize: "12px",
              }}
            >
              {scanning ? "Scanning for drift…" : "No drift items."}
            </div>
          ) : (
            driftItems.map((item) => (
              <DriftRow
                key={item.id}
                item={item}
                onAcknowledge={handleAcknowledge}
                onRescan={triggerScan}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
