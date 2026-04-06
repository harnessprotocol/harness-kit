import { useState } from "react";
import {
  getAllowedTools,
  setAllowedTools,
  getHarnessPermissionOverrides,
  setHarnessPermissionOverrides,
  DEFAULT_ALLOWED_TOOLS,
} from "../../lib/preferences";
import { TOOL_NAMES } from "../../lib/tool-names";

// ── Close icon ────────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ── Check icon ────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ── Props ─────────────────────────────────────────────────────

interface ToolApprovalPanelProps {
  /** The harness ID of the active session — used to look up per-harness overrides. */
  harnessId?: string;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────

export default function ToolApprovalPanel({ harnessId, onClose }: ToolApprovalPanelProps) {
  // Resolve the effective tool list: harness override → global default
  const [tools, setToolsState] = useState<string[]>(() => {
    if (harnessId) {
      const overrides = getHarnessPermissionOverrides();
      if (overrides[harnessId]?.allowedTools) return overrides[harnessId].allowedTools!;
    }
    return getAllowedTools();
  });

  const isHarnessOverride = harnessId
    ? Boolean(getHarnessPermissionOverrides()[harnessId]?.allowedTools)
    : false;
  const [hasOverride, setHasOverride] = useState(isHarnessOverride);

  function toggle(tool: string) {
    const next = tools.includes(tool)
      ? tools.filter((t) => t !== tool)
      : [...tools, tool];
    persist(next);
  }

  function persist(next: string[]) {
    setToolsState(next);
    if (harnessId && hasOverride) {
      const overrides = getHarnessPermissionOverrides();
      setHarnessPermissionOverrides({
        ...overrides,
        [harnessId]: { ...overrides[harnessId], allowedTools: next },
      });
    } else {
      setAllowedTools(next);
    }
  }

  function restoreDefaults() {
    persist([...DEFAULT_ALLOWED_TOOLS]);
  }

  function enableHarnessOverride() {
    if (!harnessId) return;
    const overrides = getHarnessPermissionOverrides();
    setHarnessPermissionOverrides({
      ...overrides,
      [harnessId]: { ...overrides[harnessId], allowedTools: [...tools] },
    });
    setHasOverride(true);
  }

  function clearHarnessOverride() {
    if (!harnessId) return;
    const overrides = getHarnessPermissionOverrides();
    const next = { ...overrides };
    if (next[harnessId]) {
      delete next[harnessId].allowedTools;
      if (Object.keys(next[harnessId]).length === 0) delete next[harnessId];
    }
    setHarnessPermissionOverrides(next);
    setHasOverride(false);
    setToolsState(getAllowedTools());
  }

  return (
    <div style={{
      width: 240,
      height: "100%",
      display: "flex",
      flexDirection: "column",
      background: "var(--bg-surface)",
      borderLeft: "1px solid var(--border-base)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 14px 10px",
        borderBottom: "1px solid var(--separator)",
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--fg-base)" }}>
            Allowed Tools
          </div>
          <div style={{ fontSize: "10px", color: "var(--fg-subtle)", marginTop: "1px" }}>
            {hasOverride && harnessId ? "This harness" : "Global"}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none", border: "none", padding: "4px",
            color: "var(--fg-subtle)", cursor: "pointer", borderRadius: "4px",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          aria-label="Close panel"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Tool list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {TOOL_NAMES.map((tool) => {
          const checked = tools.includes(tool.name);
          return (
            <button
              key={tool.name}
              onClick={() => toggle(tool.name)}
              style={{
                display: "flex", alignItems: "flex-start", gap: "10px",
                width: "100%", padding: "7px 14px",
                background: checked ? "var(--accent-light)" : "transparent",
                border: "none", cursor: "pointer", textAlign: "left",
              }}
            >
              {/* Checkbox */}
              <div style={{
                width: 15, height: 15, borderRadius: "3px", flexShrink: 0,
                marginTop: "1px",
                border: checked ? "none" : "1.5px solid var(--border-strong)",
                background: checked ? "var(--accent)" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff",
              }}>
                {checked && <CheckIcon />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: "12px", fontWeight: 500,
                  color: checked ? "var(--accent-text)" : "var(--fg-base)",
                  fontFamily: "ui-monospace, monospace",
                }}>
                  {tool.name}
                </div>
                <div style={{ fontSize: "10px", color: "var(--fg-subtle)", marginTop: "1px", lineHeight: 1.4 }}>
                  {tool.hint}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: "10px 14px",
        borderTop: "1px solid var(--separator)",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      }}>
        {harnessId && (
          hasOverride ? (
            <button
              onClick={clearHarnessOverride}
              style={{
                fontSize: "11px", color: "var(--fg-muted)", background: "none",
                border: "none", padding: 0, cursor: "pointer", textAlign: "left",
              }}
            >
              Use global list for this harness
            </button>
          ) : (
            <button
              onClick={enableHarnessOverride}
              style={{
                fontSize: "11px", color: "var(--accent-text)", background: "none",
                border: "none", padding: 0, cursor: "pointer", textAlign: "left",
              }}
            >
              Override for this harness
            </button>
          )
        )}
        <button
          onClick={restoreDefaults}
          style={{
            fontSize: "11px", color: "var(--fg-subtle)", background: "none",
            border: "none", padding: 0, cursor: "pointer", textAlign: "left",
          }}
        >
          Restore defaults
        </button>
      </div>
    </div>
  );
}
