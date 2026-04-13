import React, { useEffect, useRef, useState } from "react";
import {
  readPermissions, updatePermissions,
  listSecurityPresets, applySecurityPreset,
  detectClaudeAccount, getHarnessHealth,
} from "../../lib/tauri";
import type { PermissionsState, SecurityPreset, HarnessHealthRecord } from "@harness-kit/shared";
import {
  getPermissionMode, setPermissionMode,
  getAllowedTools, setAllowedTools,
  getHarnessPermissionOverrides, setHarnessPermissionOverrides,
  resetPermissionDefaults,
  getAutoModeUnlocked, setAutoModeUnlocked,
  getBudgetGuard, setBudgetGuard,
  getResilienceConfig, setResilienceConfig,
  type PermissionMode, type HarnessPermissionOverride, type BudgetGuardConfig,
  type ResilienceProfile, type ResilienceConfigMap,
} from "../../lib/preferences";
import { BUILTIN_HARNESSES } from "../../lib/harness-definitions";
import { TOOL_NAMES } from "../../lib/tool-names";

// ── Icons ─────────────────────────────────────────────────────

function IconSkip() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="9" y1="9" x2="15" y2="15" />
      <line x1="15" y1="9" x2="9" y2="15" />
    </svg>
  );
}

function IconAuto() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.88 5.78 5.88.04-4.77 3.47 1.82 5.78L12 15.08l-4.81 3.0 1.82-5.78L4.24 8.82l5.88-.04z" />
    </svg>
  );
}

function IconTools() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="14" y2="12" />
      <line x1="4" y1="18" x2="11" y2="18" />
      <circle cx="18" cy="12" r="3" />
      <circle cx="15" cy="18" r="3" />
    </svg>
  );
}

function IconRemove() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 200ms" }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ── Suggestion datasets (shared between tools list and suggest input) ──────

const TOOL_SUGGESTIONS = TOOL_NAMES.map((t) => ({ value: t.name, hint: t.hint })).concat([
  { value: "*", hint: "All tools (wildcard)" },
]);

const PATH_SUGGESTIONS: { value: string; hint: string }[] = [
  { value: ".", hint: "Current project directory" },
  { value: "~", hint: "Home directory" },
  { value: "~/Desktop", hint: "Desktop folder" },
  { value: "~/Documents", hint: "Documents folder" },
  { value: "~/repos", hint: "Repos directory" },
  { value: "/tmp", hint: "Temporary files" },
  { value: "*", hint: "All paths (wildcard)" },
];

const HOST_SUGGESTIONS: { value: string; hint: string }[] = [
  { value: "github.com", hint: "GitHub web" },
  { value: "api.github.com", hint: "GitHub API" },
  { value: "raw.githubusercontent.com", hint: "GitHub raw content" },
  { value: "registry.npmjs.org", hint: "npm registry" },
  { value: "pypi.org", hint: "Python packages" },
  { value: "crates.io", hint: "Rust packages" },
  { value: "api.anthropic.com", hint: "Anthropic API" },
  { value: "api.openai.com", hint: "OpenAI API" },
  { value: "huggingface.co", hint: "Hugging Face" },
  { value: "stackoverflow.com", hint: "Stack Overflow" },
  { value: "*", hint: "All hosts (wildcard)" },
];

// ── Chip ─────────────────────────────────────────────────────

function Chip({ label, color, onRemove }: {
  label: string;
  color: "green" | "red" | "amber";
  onRemove: () => void;
}) {
  const colors = {
    green: { bg: "rgba(22,163,74,0.08)", border: "rgba(22,163,74,0.22)", text: "#16a34a" },
    red:   { bg: "rgba(220,38,38,0.08)",  border: "rgba(220,38,38,0.22)",  text: "#dc2626" },
    amber: { bg: "rgba(217,119,6,0.08)",  border: "rgba(217,119,6,0.22)",  text: "#d97706" },
  };
  const c = colors[color];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "5px",
      fontSize: "11px", fontWeight: 500, padding: "2px 7px 2px 8px",
      borderRadius: "4px", border: `1px solid ${c.border}`,
      background: c.bg, color: c.text,
      fontFamily: "ui-monospace, monospace",
    }}>
      {label}
      <button
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        style={{
          border: "none", background: "none", color: c.text,
          cursor: "pointer", padding: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
          opacity: 0.7, lineHeight: 1,
        }}
      >
        <IconRemove />
      </button>
    </span>
  );
}

// ── SuggestInput ──────────────────────────────────────────────

function SuggestInput({ onAdd, placeholder, suggestions, existing }: {
  onAdd: (v: string) => void;
  placeholder: string;
  suggestions: { value: string; hint: string }[];
  existing: string[];
}) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = suggestions.filter(
    (s) =>
      !existing.includes(s.value) &&
      (value === "" || s.value.toLowerCase().includes(value.toLowerCase()) ||
        s.hint.toLowerCase().includes(value.toLowerCase())),
  );

  function select(v: string) {
    onAdd(v);
    setValue("");
    setOpen(false);
    setHighlightIdx(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      if (highlightIdx >= 0 && highlightIdx < filtered.length) select(filtered[highlightIdx].value);
      else if (value.trim()) select(value.trim());
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlightIdx(-1);
    }
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setHighlightIdx(-1);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={wrapperRef} style={{ position: "relative", marginTop: "6px" }}>
      <div style={{ display: "flex", gap: "4px" }}>
        <input
          value={value}
          onChange={(e) => { setValue(e.target.value); setOpen(true); setHighlightIdx(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          style={{
            flex: 1, fontSize: "11px", padding: "5px 8px",
            borderRadius: "5px", border: "1px solid var(--border-base)",
            background: "var(--bg-base)", color: "var(--fg-base)",
            outline: "none",
          }}
        />
        <button
          onClick={() => { if (value.trim()) select(value.trim()); }}
          style={{
            fontSize: "11px", padding: "5px 10px", borderRadius: "5px",
            border: "1px solid var(--border-base)", background: "var(--bg-surface)",
            color: "var(--fg-muted)", cursor: "pointer",
          }}
        >
          Add
        </button>
      </div>

      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: "46px",
          marginTop: "2px", zIndex: 20,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-base)",
          borderRadius: "6px",
          boxShadow: "var(--shadow-md)",
          maxHeight: "180px", overflowY: "auto",
        }}>
          {filtered.map((s, i) => (
            <button
              key={s.value}
              onPointerDown={(e) => { e.preventDefault(); select(s.value); }}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                width: "100%", padding: "5px 10px",
                border: "none",
                borderBottom: i < filtered.length - 1 ? "1px solid var(--separator)" : "none",
                background: i === highlightIdx ? "var(--accent-light)" : "transparent",
                cursor: "pointer", textAlign: "left",
              }}
            >
              <span style={{
                fontSize: "11px", fontWeight: 500,
                color: i === highlightIdx ? "var(--accent-text)" : "var(--fg-base)",
                fontFamily: "ui-monospace, monospace",
              }}>
                {s.value}
              </span>
              <span style={{ fontSize: "10px", color: "var(--fg-subtle)", marginLeft: "8px" }}>
                {s.hint}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Permission mode card ──────────────────────────────────────

interface ModeCardProps {
  id: PermissionMode;
  label: string;
  flag: string;
  description: string;
  icon: React.ReactNode;
  accentColor: string;
  selected: boolean;
  note?: string;
  onClick: () => void;
}

function ModeCard({ id: _id, label, flag, description, icon, accentColor, selected, note, onClick }: ModeCardProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", alignItems: "flex-start",
        textAlign: "left", padding: "14px", cursor: "pointer",
        background: selected ? `${accentColor}0d` : "var(--bg-surface)",
        border: selected
          ? `1.5px solid ${accentColor}`
          : "1.5px solid var(--border-base)",
        borderRadius: "8px",
        transition: "border-color 150ms, background 150ms",
        gap: "8px",
        flex: 1,
      }}
      aria-pressed={selected}
    >
      {/* Icon + label row */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%" }}>
        <div style={{ color: selected ? accentColor : "var(--fg-muted)" }}>
          {icon}
        </div>
        <span style={{
          fontSize: "12px", fontWeight: 600,
          color: selected ? accentColor : "var(--fg-base)",
          flex: 1,
        }}>
          {label}
        </span>
        {selected && (
          <div style={{
            width: 16, height: 16, borderRadius: "50%",
            background: accentColor,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", flexShrink: 0,
          }}>
            <IconCheck />
          </div>
        )}
      </div>

      {/* Description */}
      <div style={{
        fontSize: "11px", color: "var(--fg-muted)", lineHeight: 1.5,
        paddingLeft: "26px",
      }}>
        {description}
      </div>

      {/* Flag badge */}
      <div style={{ paddingLeft: "26px" }}>
        <code style={{
          fontSize: "10px", fontFamily: "ui-monospace, monospace",
          color: selected ? accentColor : "var(--fg-subtle)",
          background: selected ? `${accentColor}14` : "var(--bg-base)",
          border: `1px solid ${selected ? `${accentColor}30` : "var(--border-subtle)"}`,
          borderRadius: "3px", padding: "1px 5px",
        }}>
          {flag}
        </code>
      </div>

      {/* Optional note (e.g. plan requirement) */}
      {note && (
        <div style={{
          paddingLeft: "26px",
          fontSize: "10px", color: "var(--fg-subtle)",
          fontStyle: "italic",
        }}>
          {note}
        </div>
      )}
    </button>
  );
}

// ── Tool entry helpers ────────────────────────────────────────

function parseToolEntry(entry: string): { name: string; scope: string } {
  const m = entry.match(/^([A-Za-z]+)\((.+)\)$/);
  if (m) return { name: m[1], scope: m[2] };
  return { name: entry, scope: "" };
}

function buildToolEntry(name: string, scope: string): string {
  const trimmed = scope.trim();
  return trimmed ? `${name}(${trimmed})` : name;
}

// ── Current config summary ────────────────────────────────────

function CurrentConfigSummary({
  mode, tools, overrides,
}: {
  mode: PermissionMode;
  tools: string[];
  overrides: Record<string, HarnessPermissionOverride>;
}) {
  const overrideCount = Object.values(overrides).filter(
    (o) => o.mode !== undefined || (o.allowedTools && o.allowedTools.length > 0)
  ).length;

  const modeColor = mode === "skip" ? "#d97706" : mode === "auto" ? "#3b82f6" : "#16a34a";
  const modeLabel = mode === "skip" ? "Skip All" : mode === "auto" ? "Auto" : "Allowed Tools";

  let detail: React.ReactNode;
  if (mode === "skip") {
    detail = <span style={{ color: "var(--fg-muted)" }}>All tool calls proceed without prompting.</span>;
  } else if (mode === "auto") {
    detail = <span style={{ color: "var(--fg-muted)" }}>AI classifiers approve non-destructive actions.</span>;
  } else if (tools.length === 0) {
    detail = <span style={{ color: "var(--danger)" }}>No tools selected — all actions will prompt.</span>;
  } else {
    detail = (
      <span style={{ color: "var(--fg-muted)", fontFamily: "ui-monospace, monospace", fontSize: "11px" }}>
        {tools.join("  ·  ")}
      </span>
    );
  }

  return (
    <div style={{
      marginBottom: "20px",
      padding: "10px 14px",
      borderRadius: "8px",
      background: "var(--bg-surface)",
      border: "1px solid var(--border-base)",
      display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "8px",
    }}>
      <span style={{
        fontSize: "10px", fontVariantCaps: "all-small-caps", letterSpacing: "0.05em",
        color: "var(--fg-subtle)", fontWeight: 500, flexShrink: 0,
      }}>
        Active
      </span>
      <span style={{
        fontSize: "11px", fontWeight: 600, color: modeColor,
        background: `${modeColor}18`, padding: "1px 8px",
        borderRadius: "10px", flexShrink: 0,
      }}>
        {modeLabel}
      </span>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {detail}
      </span>
      {overrideCount > 0 && (
        <span style={{ fontSize: "11px", color: "var(--fg-subtle)", flexShrink: 0 }}>
          {overrideCount} harness override{overrideCount > 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}

// ── Allowed tools checklist ───────────────────────────────────

function AllowedToolsSection({
  tools, onChange,
}: {
  tools: string[];
  onChange: (next: string[]) => void;
}) {
  const activeEntries = tools.map(parseToolEntry);
  const activeNames = new Set(activeEntries.map((e) => e.name));
  const inactiveTools = TOOL_NAMES.filter((t) => !activeNames.has(t.name));

  function add(name: string) {
    onChange([...tools, name]);
  }

  function remove(name: string) {
    onChange(tools.filter((t) => parseToolEntry(t).name !== name));
  }

  function updateScope(name: string, scope: string) {
    onChange(tools.map((t) => {
      const parsed = parseToolEntry(t);
      return parsed.name === name ? buildToolEntry(name, scope) : t;
    }));
  }

  return (
    <div style={{ marginTop: "12px" }}>
      <p style={{
        fontSize: "11px", fontWeight: 500, fontVariantCaps: "all-small-caps",
        letterSpacing: "0.04em", color: "var(--fg-subtle)", margin: "0 0 8px",
      }}>
        Allowed without prompting
      </p>

      {/* Active tools — shown as rows with optional scope input */}
      {activeEntries.length > 0 && (
        <div style={{ marginBottom: "10px" }}>
          {/* Column headers */}
          <div style={{
            display: "grid", gridTemplateColumns: "100px 1fr auto",
            gap: "6px", padding: "0 8px 4px",
          }}>
            <span style={{ fontSize: "10px", color: "var(--fg-subtle)", fontVariantCaps: "all-small-caps", letterSpacing: "0.04em" }}>
              Tool
            </span>
            <span style={{ fontSize: "10px", color: "var(--fg-subtle)", fontVariantCaps: "all-small-caps", letterSpacing: "0.04em" }}>
              Scope pattern (optional)
            </span>
          </div>

          {activeEntries.map(({ name, scope }) => {
            const toolDef = TOOL_NAMES.find((t) => t.name === name);
            return (
              <div key={name} style={{
                display: "grid", gridTemplateColumns: "100px 1fr auto",
                alignItems: "center", gap: "6px",
                padding: "5px 8px", marginBottom: "3px",
                borderRadius: "6px",
                border: "1px solid rgba(99,102,241,0.2)",
                background: "var(--accent-light)",
              }}>
                <span style={{
                  fontSize: "11px", fontWeight: 600,
                  color: "var(--accent-text)",
                  fontFamily: "ui-monospace, monospace",
                }}>
                  {name}
                </span>
                <input
                  value={scope}
                  onChange={(e) => updateScope(name, e.target.value)}
                  placeholder={
                    toolDef?.scopeHint
                      ? `e.g. ${toolDef.scopeHint}`
                      : "all (leave blank for unrestricted)"
                  }
                  style={{
                    fontSize: "11px", padding: "3px 7px",
                    borderRadius: "4px",
                    border: "1px solid var(--border-base)",
                    background: "var(--bg-base)",
                    color: "var(--fg-base)",
                    outline: "none",
                    fontFamily: "ui-monospace, monospace",
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                />
                <button
                  onClick={() => remove(name)}
                  title={`Remove ${name}`}
                  style={{
                    border: "none", background: "none",
                    color: "var(--fg-subtle)", cursor: "pointer",
                    padding: "2px 4px", borderRadius: "3px",
                    fontSize: "14px", lineHeight: 1,
                    display: "flex", alignItems: "center",
                  }}
                >
                  <IconRemove />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Inactive tools — compact add buttons */}
      {inactiveTools.length > 0 && (
        <div>
          <p style={{
            fontSize: "10px", color: "var(--fg-placeholder)",
            fontVariantCaps: "all-small-caps", letterSpacing: "0.04em",
            margin: "0 0 5px",
          }}>
            {activeEntries.length > 0 ? "Add another tool" : "Select tools"}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {inactiveTools.map((tool) => (
              <button
                key={tool.name}
                onClick={() => add(tool.name)}
                title={tool.hint}
                style={{
                  display: "flex", alignItems: "center", gap: "4px",
                  padding: "4px 9px",
                  borderRadius: "5px",
                  border: "1px solid var(--border-subtle)",
                  background: "var(--bg-base)",
                  cursor: "pointer",
                  fontSize: "11px", color: "var(--fg-muted)",
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                <span style={{ fontSize: "10px", opacity: 0.6 }}>+</span>
                {tool.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {activeEntries.length === 0 && inactiveTools.length === 0 && (
        <p style={{ fontSize: "11px", color: "var(--fg-placeholder)", margin: 0 }}>
          All tools are allowed. Remove some to restrict.
        </p>
      )}
    </div>
  );
}

// ── Per-harness overrides ─────────────────────────────────────

function HarnessOverridesSection({
  overrides, onChange,
}: {
  overrides: Record<string, HarnessPermissionOverride>;
  onChange: (next: Record<string, HarnessPermissionOverride>) => void;
}) {
  const [open, setOpen] = useState(false);

  function setHarnessMode(id: string, mode: PermissionMode | undefined) {
    const next = { ...overrides };
    if (!next[id]) next[id] = {};
    if (mode === undefined) {
      delete next[id].mode;
      if (Object.keys(next[id]).length === 0) delete next[id];
    } else {
      next[id].mode = mode;
    }
    onChange(next);
  }

  const modes: { value: PermissionMode; label: string }[] = [
    { value: "skip", label: "Skip All" },
    { value: "auto", label: "Auto" },
    { value: "allowed-tools", label: "Allowed Tools" },
  ];

  return (
    <div style={{ marginTop: "16px" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center", gap: "6px",
          background: "none", border: "none", padding: 0, cursor: "pointer",
          color: "var(--fg-subtle)",
        }}
      >
        <IconChevron open={open} />
        <span style={{
          fontSize: "11px", fontWeight: 500,
          fontVariantCaps: "all-small-caps", letterSpacing: "0.04em",
          color: "var(--fg-subtle)",
        }}>
          Per-harness overrides
        </span>
      </button>

      {open && (
        <div style={{
          marginTop: "10px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "7px",
          overflow: "hidden",
        }}>
          {BUILTIN_HARNESSES.map((harness, i) => {
            const override = overrides[harness.id];
            const effective = override?.mode;
            return (
              <div
                key={harness.id}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "9px 12px",
                  borderBottom: i < BUILTIN_HARNESSES.length - 1 ? "1px solid var(--separator)" : "none",
                }}
              >
                <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--fg-base)" }}>
                  {harness.name}
                </span>
                <div style={{ display: "flex", gap: "4px" }}>
                  <button
                    onClick={() => setHarnessMode(harness.id, undefined)}
                    style={{
                      fontSize: "10px", padding: "3px 8px", borderRadius: "4px",
                      border: "1px solid var(--border-base)",
                      background: effective === undefined ? "var(--bg-base)" : "transparent",
                      color: effective === undefined ? "var(--fg-base)" : "var(--fg-subtle)",
                      cursor: "pointer", fontWeight: effective === undefined ? 500 : 400,
                    }}
                  >
                    Global
                  </button>
                  {modes.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => setHarnessMode(harness.id, m.value)}
                      style={{
                        fontSize: "10px", padding: "3px 8px", borderRadius: "4px",
                        border: "1px solid var(--border-base)",
                        background: effective === m.value ? "var(--accent-light)" : "transparent",
                        color: effective === m.value ? "var(--accent-text)" : "var(--fg-subtle)",
                        cursor: "pointer", fontWeight: effective === m.value ? 500 : 400,
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Preset colors ─────────────────────────────────────────────

const PRESET_COLORS: Record<string, string> = {
  Strict: "#16a34a",
  Standard: "#3b82f6",
  Permissive: "#d97706",
};

const PROFILE_LABELS: Record<ResilienceProfile, string> = {
  conservative: "Conservative",
  balanced: "Balanced",
  aggressive: "Aggressive",
};

// ── Page ──────────────────────────────────────────────────────

export default function PermissionsPage() {
  // Claude settings.json permissions
  const [permissions, setPermissions] = useState<PermissionsState | null>(null);
  const [presets, setPresets] = useState<SecurityPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tauriAvailable] = useState(() =>
    typeof window !== "undefined" && !!(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
  );
  const [saving, setSaving] = useState(false);
  const [confirmPreset, setConfirmPreset] = useState<SecurityPreset | null>(null);
  const [dirty, setDirty] = useState(false);
  const [harnessHealth, setHarnessHealth] = useState<HarnessHealthRecord[]>([]);
  const [resilienceConfig, setResilienceConfigState] = useState<ResilienceConfigMap>(() => getResilienceConfig());

  const [budgetGuard, setBudgetGuardState] = useState<BudgetGuardConfig>(() => getBudgetGuard());

  function handleBudgetGuardChange(update: Partial<BudgetGuardConfig>) {
    setBudgetGuardState((prev) => {
      const next = { ...prev, ...update };
      setBudgetGuard(next);
      return next;
    });
  }

  // HarnessKit permission mode (localStorage)
  const [autoUnlocked, setAutoUnlockedState] = useState<boolean>(getAutoModeUnlocked);
  const [mode, setMode] = useState<PermissionMode>(getPermissionMode);
  const [allowedTools, setAllowedToolsState] = useState<string[]>(getAllowedTools);
  const [overrides, setOverridesState] = useState<Record<string, HarnessPermissionOverride>>(
    getHarnessPermissionOverrides,
  );

  // HarnessKit permission mode (localStorage)
  const [autoUnlocked, setAutoUnlockedState] = useState<boolean>(getAutoModeUnlocked);
  const [mode, setMode] = useState<PermissionMode>(getPermissionMode);
  const [allowedTools, setAllowedToolsState] = useState<string[]>(getAllowedTools);
  const [overrides, setOverridesState] = useState<Record<string, HarnessPermissionOverride>>(
    getHarnessPermissionOverrides,
  );

  useEffect(() => {
    // Tauri APIs are only available in the desktop app. Skip gracefully in browser.
    if (!tauriAvailable) {
      setLoading(false);
      return;
    }
    // Detect account plan and auto-unlock Auto mode if eligible.
    detectClaudeAccount().then((info) => {
      if (info.auto_mode_available) {
        setAutoUnlockedState(true);
        setAutoModeUnlocked(true);
      } else {
        // Revoke if account no longer qualifies (e.g. plan downgrade).
        setAutoUnlockedState(false);
        setAutoModeUnlocked(false);
        if (getPermissionMode() === "auto") handleModeChange("skip");
      }
    }).catch(() => {
      // claude CLI not available or not logged in — leave as stored preference.
    });

    Promise.all([readPermissions(), listSecurityPresets()])
      .then(([perms, presetList]) => {
        setPermissions(perms);
        setPresets(presetList);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    getHarnessHealth()
      .then(setHarnessHealth)
      .catch(() => {});
  }, []);

  function handleModeChange(next: PermissionMode) {
    setMode(next);
    setPermissionMode(next);
  }

  function handleToolsChange(next: string[]) {
    setAllowedToolsState(next);
    setAllowedTools(next);
  }

  function handleOverridesChange(next: Record<string, HarnessPermissionOverride>) {
    setOverridesState(next);
    setHarnessPermissionOverrides(next);
  }

  function handleReset() {
    resetPermissionDefaults();
    setAllowedToolsState(["Read", "Grep", "Glob"]);
    setOverridesState({});
  }

  function handleResilienceProfileChange(harnessId: string, profile: ResilienceProfile) {
    const next = {
      ...resilienceConfig,
      [harnessId]: { ...(resilienceConfig[harnessId] ?? { profile: "balanced" }), profile },
    };
    setResilienceConfigState(next);
    setResilienceConfig(next);
  }

  function handleFallbackChange(harnessId: string, fallbackHarnessId: string) {
    const next = {
      ...resilienceConfig,
      [harnessId]: {
        ...(resilienceConfig[harnessId] ?? { profile: "balanced" as ResilienceProfile }),
        fallbackHarnessId: fallbackHarnessId || undefined,
      },
    };
    setResilienceConfigState(next);
    setResilienceConfig(next);
  }

  // ── Claude settings.json helpers ────────────────────────────

  function updateLocal(updater: (p: PermissionsState) => PermissionsState) {
    if (!permissions) return;
    setPermissions(updater(permissions));
    setDirty(true);
  }

  function addToList(
    category: "allow" | "deny" | "ask" | "writable" | "readonly" | "allowedHosts",
    value: string,
  ) {
    updateLocal((p) => {
      const next = JSON.parse(JSON.stringify(p)) as PermissionsState;
      if (category === "allow" || category === "deny" || category === "ask") {
        if (!next.tools[category].includes(value)) next.tools[category].push(value);
      } else if (category === "writable" || category === "readonly") {
        if (!next.paths[category].includes(value)) next.paths[category].push(value);
      } else if (category === "allowedHosts") {
        if (!next.network.allowedHosts.includes(value)) next.network.allowedHosts.push(value);
      }
      return next;
    });
  }

  function removeFromList(
    category: "allow" | "deny" | "ask" | "writable" | "readonly" | "allowedHosts",
    value: string,
  ) {
    updateLocal((p) => {
      const next = JSON.parse(JSON.stringify(p)) as PermissionsState;
      if (category === "allow" || category === "deny" || category === "ask") {
        next.tools[category] = next.tools[category].filter((v) => v !== value);
      } else if (category === "writable" || category === "readonly") {
        next.paths[category] = next.paths[category].filter((v) => v !== value);
      } else if (category === "allowedHosts") {
        next.network.allowedHosts = next.network.allowedHosts.filter((v) => v !== value);
      }
      return next;
    });
  }

  async function handleSave() {
    if (!permissions) return;
    setSaving(true);
    try {
      await updatePermissions(permissions);
      setDirty(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleApplyPreset(preset: SecurityPreset) {
    setSaving(true);
    try {
      await applySecurityPreset(preset.id);
      setPermissions(preset.permissions);
      setDirty(false);
      setConfirmPreset(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }


  return (
    <div style={{ padding: "20px 24px", maxWidth: "700px" }}>
      {/* ── Page header ── */}
      <div style={{ marginBottom: "16px" }}>
        <h1 style={{
          fontSize: "17px", fontWeight: 600, letterSpacing: "-0.3px",
          color: "var(--fg-base)", margin: "0 0 3px",
        }}>
          Permissions
        </h1>
        <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: 0 }}>
          Control how much autonomy Claude and other harnesses have when running tasks.
        </p>
      </div>

      {/* ── Active configuration summary ── */}
      <CurrentConfigSummary mode={mode} tools={allowedTools} overrides={overrides} />

      {/* ── Permission Mode section ── */}
      <section style={{ marginBottom: "28px" }}>
        <p style={{
          fontSize: "11px", fontWeight: 500, fontVariantCaps: "all-small-caps",
          letterSpacing: "0.04em", color: "var(--fg-subtle)", margin: "0 0 10px",
        }}>
          Task execution mode
        </p>

        <div style={{ display: "flex", gap: "8px" }}>
          <ModeCard
            id="skip"
            label="Skip All"
            flag="--dangerously-skip-permissions"
            description="No prompts. Claude can write files, run commands, and access your system freely."
            icon={<IconSkip />}
            accentColor="#d97706"
            selected={mode === "skip"}
            onClick={() => handleModeChange("skip")}
          />
          {autoUnlocked && (
            <ModeCard
              id="auto"
              label="Auto"
              flag="--permission-mode auto"
              description="AI classifiers approve non-destructive actions. Higher-risk operations still prompt."
              icon={<IconAuto />}
              accentColor="#3b82f6"
              selected={mode === "auto"}
              onClick={() => handleModeChange("auto")}
            />
          )}
          <ModeCard
            id="allowed-tools"
            label="Allowed Tools"
            flag="--allowedTools <list>"
            description="Select which tools run without approval. All others prompt in the terminal."
            icon={<IconTools />}
            accentColor="#16a34a"
            selected={mode === "allowed-tools"}
            onClick={() => handleModeChange("allowed-tools")}
          />
        </div>


        {/* Allowed tools checklist — visible when mode is allowed-tools */}
        {mode === "allowed-tools" && (
          <AllowedToolsSection tools={allowedTools} onChange={handleToolsChange} />
        )}

        {/* Per-harness overrides */}
        <HarnessOverridesSection overrides={overrides} onChange={handleOverridesChange} />

        {/* Reset */}
        <div style={{ marginTop: "14px" }}>
          <button
            onClick={handleReset}
            style={{
              fontSize: "11px", color: "var(--fg-subtle)",
              background: "none", border: "none", padding: 0,
              cursor: "pointer", textDecoration: "underline",
              textUnderlineOffset: "2px",
            }}
          >
            Reset to defaults
          </button>
          <span style={{ fontSize: "11px", color: "var(--fg-placeholder)", marginLeft: "6px" }}>
            (clears allowed-tools list, per-harness overrides, and first-run prompt)
          </span>
        </div>
      </section>

      {/* ── Divider ── */}
      <div style={{ height: "1px", background: "var(--separator)", marginBottom: "24px" }} />

      {/* ── Claude settings.json section ── */}
      <section>
        {!tauriAvailable && (
          <div style={{
            background: "var(--bg-surface)", border: "1px solid var(--border-base)",
            borderLeft: "3px solid var(--border-strong)", borderRadius: "8px",
            padding: "10px 14px", fontSize: "12px", color: "var(--fg-muted)",
            marginBottom: "14px",
          }}>
            Claude settings.json editing requires the desktop app.
          </div>
        )}
        {tauriAvailable && loading && !error && (
          <p style={{ fontSize: "12px", color: "var(--fg-subtle)", margin: "0 0 14px" }}>Loading…</p>
        )}
        {tauriAvailable && error && (
          <div style={{
            background: "var(--bg-surface)", border: "1px solid var(--danger-light)",
            borderLeft: "3px solid var(--danger)", borderRadius: "8px",
            padding: "10px 14px", fontSize: "12px", color: "var(--danger)",
            marginBottom: "14px",
          }}>
            {error}
          </div>
        )}
        <div style={{ marginBottom: "14px" }}>
          <p style={{
            fontSize: "11px", fontWeight: 500, fontVariantCaps: "all-small-caps",
            letterSpacing: "0.04em", color: "var(--fg-subtle)", margin: "0 0 2px",
          }}>
            Claude settings.json
          </p>
          <p style={{ fontSize: "11px", color: "var(--fg-placeholder)", margin: 0 }}>
            Tool access, file paths, and network rules — written to ~/.claude/settings.json
          </p>
        </div>

        {/* Quick presets */}
        {presets.length > 0 && (
          <div style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setConfirmPreset(preset)}
                  style={{
                    padding: "7px 12px",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-base)",
                    borderLeft: `3px solid ${PRESET_COLORS[preset.name] ?? "var(--border-base)"}`,
                    borderRadius: "6px",
                    cursor: "pointer", textAlign: "left",
                  }}
                >
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--fg-base)" }}>{preset.name}</div>
                  <div style={{ fontSize: "10px", color: "var(--fg-subtle)", marginTop: "1px", lineHeight: 1.3 }}>
                    {preset.description}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Preset confirm */}
        {confirmPreset && (
          <div style={{
            background: "var(--bg-surface)", border: "1px solid var(--border-base)",
            borderRadius: "8px", padding: "12px 14px", marginBottom: "14px",
          }}>
            <p style={{ fontSize: "12px", color: "var(--fg-base)", margin: "0 0 10px" }}>
              Apply <strong>{confirmPreset.name}</strong> preset? This will overwrite current settings.
            </p>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onClick={() => handleApplyPreset(confirmPreset)}
                disabled={saving}
                className="btn btn-primary btn-sm"
              >
                {saving ? "Applying…" : "Apply"}
              </button>
              <button onClick={() => setConfirmPreset(null)} className="btn btn-secondary btn-sm">
                Cancel
              </button>
            </div>
          </div>
        )}

        {permissions && (
          <>
            {/* Unified card */}
            <div style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-base)",
              borderRadius: "10px",
              overflow: "hidden",
              marginBottom: "14px",
            }}>
              {/* Tools */}
              <div style={{ padding: "14px 16px" }}>
                <p style={{
                  fontSize: "11px", fontWeight: 500, fontVariantCaps: "all-small-caps",
                  letterSpacing: "0.04em", color: "var(--fg-subtle)", margin: "0 0 12px",
                }}>
                  Tools
                </p>
                {(() => {
                  const allTools = [...permissions.tools.allow, ...permissions.tools.deny, ...permissions.tools.ask];
                  const rows: { key: "allow" | "deny" | "ask"; label: string; color: string; chipColor: "green" | "red" | "amber" }[] = [
                    { key: "allow", label: "Allow", color: "#16a34a", chipColor: "green" },
                    { key: "deny",  label: "Deny",  color: "#dc2626", chipColor: "red"   },
                    { key: "ask",   label: "Ask",   color: "#d97706", chipColor: "amber" },
                  ];
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {rows.map(({ key, label, color, chipColor }) => (
                        <div key={key} style={{ display: "flex", gap: "10px" }}>
                          <span style={{
                            fontSize: "11px", fontWeight: 600, color,
                            minWidth: "38px", paddingTop: "5px",
                          }}>
                            {label}
                          </span>
                          <div style={{ flex: 1 }}>
                            {permissions.tools[key].length > 0 && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "4px" }}>
                                {permissions.tools[key].map((t) => (
                                  <Chip key={t} label={t} color={chipColor} onRemove={() => removeFromList(key, t)} />
                                ))}
                              </div>
                            )}
                            <SuggestInput
                              onAdd={(v) => addToList(key, v)}
                              placeholder={`Add ${label.toLowerCase()} rule…`}
                              suggestions={TOOL_SUGGESTIONS}
                              existing={allTools}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              <div style={{ height: "1px", background: "var(--separator)", margin: "0 16px" }} />

              {/* Paths */}
              <div style={{ padding: "14px 16px" }}>
                <p style={{
                  fontSize: "11px", fontWeight: 500, fontVariantCaps: "all-small-caps",
                  letterSpacing: "0.04em", color: "var(--fg-subtle)", margin: "0 0 12px",
                }}>
                  Paths
                </p>
                {(() => {
                  const allPaths = [...permissions.paths.writable, ...permissions.paths.readonly];
                  return (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                      <div>
                        <p style={{ fontSize: "11px", fontWeight: 600, color: "#16a34a", margin: "0 0 6px" }}>Writable</p>
                        {permissions.paths.writable.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "4px" }}>
                            {permissions.paths.writable.map((p) => (
                              <Chip key={p} label={p} color="green" onRemove={() => removeFromList("writable", p)} />
                            ))}
                          </div>
                        )}
                        <SuggestInput onAdd={(v) => addToList("writable", v)} placeholder="Add path…" suggestions={PATH_SUGGESTIONS} existing={allPaths} />
                      </div>
                      <div>
                        <p style={{ fontSize: "11px", fontWeight: 600, color: "#d97706", margin: "0 0 6px" }}>Read-only</p>
                        {permissions.paths.readonly.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "4px" }}>
                            {permissions.paths.readonly.map((p) => (
                              <Chip key={p} label={p} color="amber" onRemove={() => removeFromList("readonly", p)} />
                            ))}
                          </div>
                        )}
                        <SuggestInput onAdd={(v) => addToList("readonly", v)} placeholder="Add path…" suggestions={PATH_SUGGESTIONS} existing={allPaths} />
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div style={{ height: "1px", background: "var(--separator)", margin: "0 16px" }} />

              {/* Network */}
              <div style={{ padding: "14px 16px" }}>
                <p style={{
                  fontSize: "11px", fontWeight: 500, fontVariantCaps: "all-small-caps",
                  letterSpacing: "0.04em", color: "var(--fg-subtle)", margin: "0 0 12px",
                }}>
                  Network — Allowed Hosts
                </p>
                {permissions.network.allowedHosts.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "4px" }}>
                    {permissions.network.allowedHosts.map((h) => (
                      <Chip key={h} label={h} color="green" onRemove={() => removeFromList("allowedHosts", h)} />
                    ))}
                  </div>
                )}
                <SuggestInput onAdd={(v) => addToList("allowedHosts", v)} placeholder="Add host…" suggestions={HOST_SUGGESTIONS} existing={permissions.network.allowedHosts} />
              </div>
            </div>

            {/* Save */}
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className={dirty ? "btn btn-primary" : "btn btn-secondary"}
              style={{ opacity: saving ? 0.6 : 1 }}
            >
              {saving ? "Saving…" : "Save to settings.json"}
            </button>
          </>
        )}
      </section>

      {/* ── Daily Budget Guard ─────────────────────────────────── */}
      <section style={{ marginTop: "32px" }}>
        <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--fg-base)", margin: "0 0 12px" }}>
          Daily Budget Guard
        </h2>
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "8px",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
        }}>
          {/* Enable toggle */}
          <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={budgetGuard.enabled}
              onChange={(e) => handleBudgetGuardChange({ enabled: e.target.checked })}
              style={{ accentColor: "var(--accent)", width: "14px", height: "14px" }}
            />
            <span style={{ fontSize: "13px", color: "var(--fg-base)", fontWeight: 500 }}>
              Enable daily budget alerts
            </span>
          </label>

          {budgetGuard.enabled && (
            <>
              {/* Token limit */}
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Daily token limit (optional)
                </label>
                <input
                  type="number"
                  min={0}
                  step={10000}
                  placeholder="e.g. 500000"
                  value={budgetGuard.dailyTokenLimit ?? ""}
                  onChange={(e) => handleBudgetGuardChange({
                    dailyTokenLimit: e.target.value ? Number(e.target.value) : undefined,
                  })}
                  style={{
                    fontSize: "13px", padding: "7px 10px", borderRadius: "6px",
                    border: "1px solid var(--border-base)", background: "var(--bg-elevated)",
                    color: "var(--fg-base)", width: "200px",
                  }}
                />
              </div>

              {/* Cost limit */}
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Daily cost limit in USD (optional)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  placeholder="e.g. 5.00"
                  value={budgetGuard.dailyEstimatedCostUSD ?? ""}
                  onChange={(e) => handleBudgetGuardChange({
                    dailyEstimatedCostUSD: e.target.value ? Number(e.target.value) : undefined,
                  })}
                  style={{
                    fontSize: "13px", padding: "7px 10px", borderRadius: "6px",
                    border: "1px solid var(--border-base)", background: "var(--bg-elevated)",
                    color: "var(--fg-base)", width: "200px",
                  }}
                />
              </div>

              <p style={{ margin: 0, fontSize: "12px", color: "var(--fg-subtle)" }}>
                When today's usage exceeds a limit, an alert banner appears in Observatory.
                Limits are checked against estimated cost using Anthropic public pricing.
              </p>
            </>
          )}
        </div>
      </section>

      {/* ── Divider ── */}
      <div style={{ height: "1px", background: "var(--separator)", marginBottom: "24px" }} />

      {/* ── Harness Resilience Profiles section ── */}
      <section>
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "8px",
          overflow: "hidden",
        }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-base)" }}>
            <p style={{ fontSize: "11px", fontWeight: 500, fontVariantCaps: "all-small-caps", letterSpacing: "0.03em", color: "var(--fg-subtle)", margin: 0 }}>
              Harness Resilience Profiles
            </p>
          </div>

          {harnessHealth.length === 0 ? (
            <div style={{ padding: "14px 16px", fontSize: "12px", color: "var(--fg-subtle)" }}>
              No harness launch history yet. Health data appears after your first comparison.
            </div>
          ) : (
            <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
              {harnessHealth.map((rec) => {
                const cfg = resilienceConfig[rec.harnessId];
                const profile = cfg?.profile ?? "balanced";
                const fallback = cfg?.fallbackHarnessId ?? "";
                const otherHarnesses = harnessHealth
                  .filter((r) => r.harnessId !== rec.harnessId)
                  .map((r) => r.harnessId);

                return (
                  <div
                    key={rec.harnessId}
                    data-testid={`resilience-row-${rec.harnessId}`}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      padding: "10px 12px",
                      background: "var(--bg-elevated)",
                      borderRadius: "6px",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    {/* Header row */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--fg-base)", flex: 1 }}>
                        {rec.harnessId}
                      </span>
                      <span style={{
                        fontSize: "10px",
                        color: rec.consecutiveFailures > 0 ? "var(--danger)" : "var(--fg-subtle)",
                      }}>
                        {rec.consecutiveFailures > 0
                          ? `${rec.consecutiveFailures} consecutive failure${rec.consecutiveFailures !== 1 ? "s" : ""}`
                          : `${rec.totalLaunches} launch${rec.totalLaunches !== 1 ? "es" : ""}, no failures`}
                      </span>
                    </div>

                    {/* Profile selector */}
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "10px", color: "var(--fg-subtle)", minWidth: "60px" }}>Profile</span>
                      <div style={{ display: "flex", gap: "4px" }}>
                        {(["conservative", "balanced", "aggressive"] as ResilienceProfile[]).map((p) => (
                          <button
                            key={p}
                            data-testid={`profile-btn-${rec.harnessId}-${p}`}
                            onClick={() => handleResilienceProfileChange(rec.harnessId, p)}
                            style={{
                              fontSize: "10px",
                              fontWeight: profile === p ? 600 : 400,
                              padding: "2px 8px",
                              borderRadius: "4px",
                              border: `1px solid ${profile === p ? "var(--accent)" : "var(--border-base)"}`,
                              background: profile === p ? "rgba(91,80,232,0.12)" : "transparent",
                              color: profile === p ? "var(--accent-text)" : "var(--fg-muted)",
                              cursor: "pointer",
                            }}
                          >
                            {PROFILE_LABELS[p]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Fallback selector */}
                    {otherHarnesses.length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontSize: "10px", color: "var(--fg-subtle)", minWidth: "60px" }}>Fallback</span>
                        <select
                          value={fallback}
                          onChange={(e) => handleFallbackChange(rec.harnessId, e.target.value)}
                          style={{
                            fontSize: "11px",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            border: "1px solid var(--border-base)",
                            background: "var(--bg-base)",
                            color: "var(--fg-base)",
                            cursor: "pointer",
                          }}
                        >
                          <option value="">None</option>
                          {otherHarnesses.map((id) => (
                            <option key={id} value={id}>{id}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
