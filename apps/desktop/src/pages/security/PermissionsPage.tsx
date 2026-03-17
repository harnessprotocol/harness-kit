import { useEffect, useState, useRef } from "react";
import {
  readPermissions, updatePermissions,
  listSecurityPresets, applySecurityPreset,
} from "../../lib/tauri";
import type { PermissionsState, SecurityPreset } from "@harness-kit/shared";

// ── Suggestion datasets ─────────────────────────────────────

const TOOL_SUGGESTIONS: { value: string; hint: string }[] = [
  { value: "Read", hint: "Read file contents" },
  { value: "Write", hint: "Create or overwrite files" },
  { value: "Edit", hint: "Make targeted edits to files" },
  { value: "Glob", hint: "Find files by pattern" },
  { value: "Grep", hint: "Search file contents" },
  { value: "Bash", hint: "Execute shell commands" },
  { value: "Agent", hint: "Launch subagent processes" },
  { value: "WebFetch", hint: "Fetch URLs" },
  { value: "WebSearch", hint: "Search the web" },
  { value: "Skill", hint: "Invoke skills" },
  { value: "NotebookEdit", hint: "Edit Jupyter notebooks" },
  { value: "LSP", hint: "Language Server Protocol" },
  { value: "*", hint: "All tools (wildcard)" },
];

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

function Chip({
  label, color, onRemove,
}: {
  label: string;
  color: "green" | "red" | "amber";
  onRemove: () => void;
}) {
  const colors = {
    green: { bg: "rgba(22,163,74,0.1)", border: "rgba(22,163,74,0.25)", text: "#16a34a" },
    red: { bg: "rgba(220,38,38,0.1)", border: "rgba(220,38,38,0.25)", text: "#dc2626" },
    amber: { bg: "rgba(217,119,6,0.1)", border: "rgba(217,119,6,0.25)", text: "#d97706" },
  };
  const c = colors[color];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "4px",
      fontSize: "11px", fontWeight: 500, padding: "2px 8px",
      borderRadius: "10px", border: `1px solid ${c.border}`,
      background: c.bg, color: c.text,
    }}>
      {label}
      <button
        onClick={onRemove}
        style={{
          border: "none", background: "none", color: c.text,
          cursor: "pointer", padding: 0, fontSize: "13px", lineHeight: 1,
        }}
      >
        x
      </button>
    </span>
  );
}

function SuggestInput({
  onAdd, placeholder, suggestions, existing,
}: {
  onAdd: (v: string) => void;
  placeholder: string;
  suggestions: { value: string; hint: string }[];
  existing: string[];
}) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Filter: match typed text, exclude already-added values
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
      if (highlightIdx >= 0 && highlightIdx < filtered.length) {
        select(filtered[highlightIdx].value);
      } else if (value.trim()) {
        select(value.trim());
      }
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

  // Close on outside click
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
            flex: 1, fontSize: "11px", padding: "4px 8px",
            borderRadius: "5px", border: "1px solid var(--border-base)",
            background: "var(--bg-base)", color: "var(--fg-base)",
          }}
        />
        <button
          onClick={() => { if (value.trim()) select(value.trim()); }}
          style={{
            fontSize: "11px", padding: "4px 10px", borderRadius: "5px",
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
                border: "none", borderBottom: i < filtered.length - 1 ? "1px solid var(--separator)" : "none",
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

const PRESET_COLORS: Record<string, string> = {
  Strict: "#16a34a",
  Standard: "#3b82f6",
  Permissive: "#d97706",
};

export default function PermissionsPage() {
  const [permissions, setPermissions] = useState<PermissionsState | null>(null);
  const [presets, setPresets] = useState<SecurityPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmPreset, setConfirmPreset] = useState<SecurityPreset | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    Promise.all([
      readPermissions(),
      listSecurityPresets(),
    ])
      .then(([perms, presetList]) => {
        setPermissions(perms);
        setPresets(presetList);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

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
        if (!next.tools[category].includes(value)) {
          next.tools[category].push(value);
        }
      } else if (category === "writable" || category === "readonly") {
        if (!next.paths[category].includes(value)) {
          next.paths[category].push(value);
        }
      } else if (category === "allowedHosts") {
        if (!next.network.allowedHosts.includes(value)) {
          next.network.allowedHosts.push(value);
        }
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

  if (loading) {
    return (
      <div style={{ padding: "20px 24px" }}>
        <p style={{ fontSize: "13px", color: "var(--fg-subtle)" }}>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "20px 24px" }}>
        <h1 className="text-title" style={{ margin: "0 0 16px" }}>Permissions</h1>
        <div style={{
          background: "var(--bg-surface)", border: "1px solid var(--border-base)",
          borderRadius: "8px", padding: "10px 14px", fontSize: "13px", color: "var(--danger)",
        }}>
          {error}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 24px", maxWidth: "680px" }}>
      {/* Header */}
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ fontSize: "17px", fontWeight: 600, letterSpacing: "-0.3px", color: "var(--fg-base)", margin: 0 }}>
          Permissions
        </h1>
        <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: "3px 0 0" }}>
          Tool access, file paths, and network rules — written to ~/.claude/settings.json
        </p>
      </div>

      {/* Presets */}
      {presets.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <p style={{ fontSize: "11px", fontWeight: 500, fontVariantCaps: "all-small-caps", letterSpacing: "0.03em", color: "var(--fg-subtle)", margin: "0 0 8px" }}>
            Quick preset
          </p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {presets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => setConfirmPreset(preset)}
                className="preset-card"
                style={{
                  padding: "8px 12px",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-base)",
                  borderLeft: `3px solid ${PRESET_COLORS[preset.name] ?? "var(--border-base)"}`,
                  borderRadius: "6px",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--fg-base)" }}>{preset.name}</div>
                <div style={{ fontSize: "10px", color: "var(--fg-subtle)", marginTop: "2px", lineHeight: 1.3 }}>{preset.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      {confirmPreset && (
        <div style={{
          background: "var(--bg-surface)", border: "1px solid var(--border-base)",
          borderRadius: "8px", padding: "14px 16px", marginBottom: "16px",
        }}>
          <p style={{ fontSize: "13px", color: "var(--fg-base)", margin: "0 0 10px" }}>
            Apply <strong>{confirmPreset.name}</strong> preset? This will overwrite current permissions.
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => handleApplyPreset(confirmPreset)}
              disabled={saving}
              style={{
                fontSize: "12px", padding: "5px 14px", borderRadius: "6px",
                border: "none", background: "var(--accent)", color: "#fff",
                cursor: saving ? "default" : "pointer", fontWeight: 500,
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "Applying…" : "Apply"}
            </button>
            <button
              onClick={() => setConfirmPreset(null)}
              style={{
                fontSize: "12px", padding: "5px 14px", borderRadius: "6px",
                border: "1px solid var(--border-base)", background: "transparent",
                color: "var(--fg-muted)", cursor: "pointer",
              }}
            >
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
            marginBottom: "16px",
          }}>
            {/* Tools */}
            <div style={{ padding: "14px 16px" }}>
              <p style={{ fontSize: "11px", fontWeight: 500, fontVariantCaps: "all-small-caps", letterSpacing: "0.03em", color: "var(--fg-subtle)", margin: "0 0 12px" }}>
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
                        <span style={{ fontSize: "11px", fontWeight: 600, color, minWidth: "38px", paddingTop: "5px" }}>{label}</span>
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
              <p style={{ fontSize: "11px", fontWeight: 500, fontVariantCaps: "all-small-caps", letterSpacing: "0.03em", color: "var(--fg-subtle)", margin: "0 0 12px" }}>
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
              <p style={{ fontSize: "11px", fontWeight: 500, fontVariantCaps: "all-small-caps", letterSpacing: "0.03em", color: "var(--fg-subtle)", margin: "0 0 12px" }}>
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
            style={{
              fontSize: "13px", fontWeight: 500, padding: "8px 20px",
              borderRadius: "6px", border: "none",
              background: dirty ? "var(--accent)" : "var(--bg-surface)",
              color: dirty ? "#fff" : "var(--fg-subtle)",
              cursor: dirty ? "pointer" : "default",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Saving…" : "Save Permissions"}
          </button>
        </>
      )}
    </div>
  );
}
