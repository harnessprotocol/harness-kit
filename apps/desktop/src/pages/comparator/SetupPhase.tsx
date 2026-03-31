import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { HarnessInfo } from "@harness-kit/shared";

// ── Types ───────────────────────────────────────────────────

interface SetupPhaseProps {
  onStart: (opts: {
    title: string;
    prompt: string;
    workingDir: string;
    pinnedCommit: string | null;
    harnesses: Array<{ id: string; name: string; model: string | null }>;
  }) => void;
}

interface GitInfo {
  isGitRepo: boolean;
  currentCommit: string | null;
  branch: string | null;
}

interface HarnessSelection {
  selected: boolean;
  model: string | null;
}

// ── Design Tokens ───────────────────────────────────────────

const tokens = {
  bgBase: "var(--bg-base)",
  bgSurface: "var(--bg-surface)",
  bgElevated: "var(--bg-elevated)",
  fgBase: "var(--fg-base)",
  fgMuted: "var(--fg-muted)",
  fgSubtle: "var(--fg-subtle)",
  fgPlaceholder: "var(--fg-placeholder)",
  borderBase: "var(--border-base)",
  borderStrong: "var(--border-strong)",
  borderSubtle: "var(--border-subtle)",
  separator: "var(--separator)",
  accent: "var(--accent)",
  accentLight: "var(--accent-light)",
  accentFg: "var(--accent-fg)",
  accentText: "var(--accent-text)",
  success: "var(--success)",
  danger: "var(--danger)",
  hoverBg: "var(--hover-bg)",
};

// ── Fonts ───────────────────────────────────────────────────

const fontStack = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';
const monoStack = 'ui-monospace, "SF Mono", monospace';

// ── Max harnesses ───────────────────────────────────────────

const MAX_SELECTED = 4;

// ── Styles ──────────────────────────────────────────────────

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    padding: "40px 32px 32px",
    height: "100%",
    overflowY: "auto" as const,
    fontFamily: fontStack,
  } as React.CSSProperties,

  inner: {
    width: "100%",
    maxWidth: 720,
    display: "flex",
    flexDirection: "column" as const,
    gap: 28,
  } as React.CSSProperties,

  // Header
  titleInput: {
    fontSize: 22,
    fontWeight: 600,
    color: tokens.fgBase,
    background: "transparent",
    border: "none",
    borderBottom: `2px dashed ${tokens.borderStrong}`,
    outline: "none",
    padding: "4px 0",
    width: "100%",
    fontFamily: fontStack,
    transition: "border-color 150ms",
  } as React.CSSProperties,

  subtitle: {
    fontSize: 13,
    color: tokens.fgMuted,
    marginTop: 4,
    fontFamily: fontStack,
    lineHeight: "1.5",
  } as React.CSSProperties,

  // Sections
  sectionLabel: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    color: tokens.fgSubtle,
    marginBottom: 8,
    fontFamily: fontStack,
  } as React.CSSProperties,

  // Git info bar
  gitBar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 12px",
    background: tokens.bgSurface,
    border: `1px solid ${tokens.borderBase}`,
    borderRadius: 6,
    fontFamily: monoStack,
    fontSize: 11,
    color: tokens.fgMuted,
    overflow: "hidden",
  } as React.CSSProperties,

  gitBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 6px",
    borderRadius: 4,
    background: tokens.accentLight,
    color: tokens.accentText,
    fontWeight: 500,
    fontSize: 10,
    fontFamily: monoStack,
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
  } as React.CSSProperties,

  gitPath: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    direction: "rtl" as const,
    textAlign: "left" as const,
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,

  gitCommit: {
    fontFamily: monoStack,
    color: tokens.fgSubtle,
    fontSize: 10,
    flexShrink: 0,
  } as React.CSSProperties,

  // Harness grid
  harnessGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 10,
  } as React.CSSProperties,

  harnessCard: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
    padding: "12px",
    borderRadius: 8,
    border: `1px solid ${tokens.borderBase}`,
    background: tokens.bgElevated,
    cursor: "pointer",
    transition: "all 150ms",
    position: "relative" as const,
  } as React.CSSProperties,

  harnessCardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } as React.CSSProperties,

  harnessStatusDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    flexShrink: 0,
  } as React.CSSProperties,

  harnessName: {
    fontSize: 13,
    fontWeight: 600,
    color: tokens.fgBase,
    fontFamily: fontStack,
  } as React.CSSProperties,

  harnessVersion: {
    fontSize: 10,
    color: tokens.fgSubtle,
    fontFamily: fontStack,
  } as React.CSSProperties,

  modelSelect: {
    width: "100%",
    padding: "4px 6px",
    fontSize: 10,
    fontFamily: monoStack,
    border: `1px solid ${tokens.borderBase}`,
    borderRadius: 4,
    background: tokens.bgSurface,
    color: tokens.fgBase,
    outline: "none",
    cursor: "pointer",
    appearance: "none" as const,
    WebkitAppearance: "none" as const,
  } as React.CSSProperties,

  // Prompt
  promptArea: {
    width: "100%",
    minHeight: 120,
    padding: "12px 14px",
    fontFamily: monoStack,
    fontSize: 13,
    lineHeight: "1.6",
    color: tokens.fgBase,
    background: tokens.bgElevated,
    border: `1px solid ${tokens.borderBase}`,
    borderRadius: 8,
    outline: "none",
    resize: "vertical" as const,
    transition: "border-color 150ms, box-shadow 150ms",
  } as React.CSSProperties,

  // Start button
  startBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    height: 42,
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    fontFamily: fontStack,
    cursor: "pointer",
    transition: "background 120ms, transform 60ms, opacity 120ms",
  } as React.CSSProperties,

  // Selection counter
  selectionCounter: {
    fontSize: 11,
    color: tokens.fgSubtle,
    fontFamily: fontStack,
    marginTop: -4,
  } as React.CSSProperties,
};

// ── Icons ───────────────────────────────────────────────────

function GitBranchIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
      <path fillRule="evenodd" d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 2l10 6-10 6V2z" />
    </svg>
  );
}

// ── Component ───────────────────────────────────────────────

export default function SetupPhase({ onStart }: SetupPhaseProps) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [workingDir, setWorkingDir] = useState("");
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [harnesses, setHarnesses] = useState<HarnessInfo[]>([]);
  const [selections, setSelections] = useState<Map<string, HarnessSelection>>(new Map());

  // ── Load project directory + git info ───────────────────────

  useEffect(() => {
    invoke<string>("get_cwd")
      .then((dir) => {
        setWorkingDir(dir);
        return invoke<GitInfo>("check_git_repo", { dir });
      })
      .then((info) => setGitInfo(info))
      .catch(() => setWorkingDir("~"));
  }, []);

  // ── Detect harnesses ────────────────────────────────────────

  useEffect(() => {
    invoke<HarnessInfo[]>("detect_harnesses")
      .then((detected) => {
        setHarnesses(detected);
        // Pre-select all available harnesses (up to MAX_SELECTED).
        const map = new Map<string, HarnessSelection>();
        let count = 0;
        for (const h of detected) {
          if (h.available && count < MAX_SELECTED) {
            map.set(h.id, { selected: true, model: h.defaultModel ?? null });
            count++;
          } else {
            map.set(h.id, { selected: false, model: h.defaultModel ?? null });
          }
        }
        setSelections(map);
      })
      .catch(console.error);
  }, []);

  // ── Derived state ──────────────────────────────────────────

  const selectedCount = useMemo(
    () => Array.from(selections.values()).filter((s) => s.selected).length,
    [selections],
  );

  const canStart = selectedCount > 0 && prompt.trim().length > 0;

  // ── Toggle harness selection ────────────────────────────────

  const toggleHarness = useCallback(
    (id: string) => {
      const harness = harnesses.find((h) => h.id === id);
      if (!harness?.available) return;

      setSelections((prev) => {
        const next = new Map(prev);
        const current = next.get(id);
        if (!current) return prev;

        if (current.selected) {
          // Deselect.
          next.set(id, { ...current, selected: false });
        } else {
          // Check max.
          const count = Array.from(next.values()).filter((s) => s.selected).length;
          if (count >= MAX_SELECTED) return prev;
          next.set(id, { ...current, selected: true });
        }

        return next;
      });
    },
    [harnesses],
  );

  // ── Global model selector: all unique models across harnesses ─

  const allModels = useMemo(() => {
    const set = new Set<string>();
    for (const h of harnesses) {
      for (const m of h.models) set.add(m);
    }
    return Array.from(set).sort();
  }, [harnesses]);

  const globalModelValue = useMemo(() => {
    const selectedModels = new Set<string | null>();
    for (const [id, sel] of selections) {
      if (!sel.selected) continue;
      const h = harnesses.find((h) => h.id === id);
      if (h && h.models.length > 0) selectedModels.add(sel.model);
    }
    if (selectedModels.size === 1) return Array.from(selectedModels)[0] ?? "";
    return "__mixed__";
  }, [selections, harnesses]);

  const setGlobalModel = useCallback(
    (model: string) => {
      setSelections((prev) => {
        const next = new Map(prev);
        for (const [id, sel] of next) {
          if (!sel.selected) continue;
          const h = harnesses.find((h) => h.id === id);
          if (h && h.models.includes(model)) {
            next.set(id, { ...sel, model });
          }
        }
        return next;
      });
    },
    [harnesses],
  );

  // ── Start handler ──────────────────────────────────────────

  const handleStart = useCallback(() => {
    if (!canStart) return;

    const selectedHarnesses: Array<{ id: string; name: string; model: string | null }> = [];
    for (const h of harnesses) {
      const sel = selections.get(h.id);
      if (sel?.selected) {
        selectedHarnesses.push({ id: h.id, name: h.name, model: sel.model });
      }
    }

    onStart({
      title: title.trim() || "Untitled comparison",
      prompt: prompt.trim(),
      workingDir,
      pinnedCommit: gitInfo?.currentCommit ?? null,
      harnesses: selectedHarnesses,
    });
  }, [canStart, title, prompt, workingDir, gitInfo, harnesses, selections, onStart]);

  // ── Keyboard shortcut: Cmd+Enter to start ───────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey && e.key === "Enter" && canStart) {
        e.preventDefault();
        handleStart();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [canStart, handleStart]);

  // ── Render ─────────────────────────────────────────────────

  return (
    <div style={styles.container}>
      <div style={styles.inner}>
        {/* ── Title ──────────────────────────────────────────── */}
        <div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled comparison..."
            style={styles.titleInput}
            onFocus={(e) => {
              e.currentTarget.style.borderBottomColor = tokens.accent;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderBottomColor = tokens.borderStrong;
            }}
          />
          <div style={styles.subtitle}>
            Send one prompt to multiple harnesses and compare results side by side
          </div>
        </div>

        {/* ── Project Directory ───────────────────────────────── */}
        <div>
          <div style={styles.sectionLabel}>Project Directory</div>
          <div style={styles.gitBar}>
            <span style={styles.gitPath}>{workingDir || "~"}</span>
            {gitInfo?.isGitRepo && (
              <>
                {gitInfo.branch && (
                  <span style={styles.gitBadge}>
                    <GitBranchIcon />
                    {gitInfo.branch}
                  </span>
                )}
                {gitInfo.currentCommit && (
                  <span style={styles.gitCommit}>
                    {gitInfo.currentCommit.slice(0, 7)}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Harnesses ──────────────────────────────────────── */}
        <div>
          <div style={styles.sectionLabel}>Harnesses</div>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}>
            {/* Global model selector */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: tokens.fgMuted,
                  fontFamily: fontStack,
                  whiteSpace: "nowrap" as const,
                }}
              >
                Model for all:
              </label>
              <select
                value={globalModelValue}
                onChange={(e) => setGlobalModel(e.target.value)}
                disabled={selectedCount === 0 || allModels.length === 0}
                style={{
                  ...styles.modelSelect,
                  width: "auto",
                  minWidth: 180,
                  opacity: selectedCount === 0 ? 0.5 : 1,
                }}
              >
                {globalModelValue === "__mixed__" && (
                  <option value="__mixed__" disabled>
                    Mixed
                  </option>
                )}
                {allModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div style={styles.selectionCounter}>
              {selectedCount} of {MAX_SELECTED} selected
            </div>
          </div>
          <div style={styles.harnessGrid}>
            {harnesses.map((h) => {
              const sel = selections.get(h.id);
              const isSelected = sel?.selected ?? false;
              const isAvailable = h.available;

              return (
                <HarnessCard
                  key={h.id}
                  harness={h}
                  isSelected={isSelected}
                  isAvailable={isAvailable}
                  model={sel?.model ?? null}
                  onToggle={() => toggleHarness(h.id)}
                />
              );
            })}
          </div>
        </div>

        {/* ── Prompt ─────────────────────────────────────────── */}
        <div>
          <div style={styles.sectionLabel}>Prompt</div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what you want each harness to build..."
            style={styles.promptArea}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = tokens.accent;
              e.currentTarget.style.boxShadow = `0 0 0 3px ${tokens.accentLight}`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = tokens.borderBase;
              e.currentTarget.style.boxShadow = "none";
            }}
          />
        </div>

        {/* ── Start Button ───────────────────────────────────── */}
        <button
          style={{
            ...styles.startBtn,
            background: canStart ? tokens.accent : tokens.borderBase,
            color: canStart ? "#ffffff" : tokens.fgPlaceholder,
            cursor: canStart ? "pointer" : "not-allowed",
            opacity: canStart ? 1 : 0.7,
          }}
          disabled={!canStart}
          onClick={handleStart}
          onMouseEnter={(e) => {
            if (!canStart) return;
            e.currentTarget.style.background = tokens.accentFg;
            e.currentTarget.style.transform = "scale(0.99)";
          }}
          onMouseLeave={(e) => {
            if (!canStart) return;
            e.currentTarget.style.background = tokens.accent;
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          <PlayIcon />
          Start Comparison
        </button>
      </div>
    </div>
  );
}

// ── Harness Card Sub-component ──────────────────────────────

function HarnessCard({
  harness,
  isSelected,
  isAvailable,
  model,
  onToggle,
}: {
  harness: HarnessInfo;
  isSelected: boolean;
  isAvailable: boolean;
  model: string | null;
  onToggle: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const cardStyle: React.CSSProperties = {
    ...styles.harnessCard,
    ...(isSelected
      ? {
          borderColor: tokens.accent,
          background: tokens.accentLight,
          boxShadow: `0 0 0 1px ${tokens.accent}`,
        }
      : {}),
    ...(!isAvailable
      ? {
          opacity: 0.45,
          cursor: "not-allowed",
        }
      : {}),
    ...(hovered && isAvailable && !isSelected
      ? {
          borderColor: tokens.borderStrong,
          background: tokens.hoverBg,
        }
      : {}),
  };

  const dotColor = isAvailable ? tokens.success : tokens.fgPlaceholder;
  const statusText = isAvailable
    ? harness.version
      ? `v${harness.version}`
      : "Available"
    : "Not found";

  return (
    <div
      style={cardStyle}
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={styles.harnessCardHeader}>
        <div style={{ ...styles.harnessStatusDot, background: dotColor }} />
        <span style={styles.harnessName}>{harness.name}</span>
      </div>
      <span style={styles.harnessVersion}>{statusText}</span>

      {/* Show selected model or info when no models available */}
      {isAvailable && harness.models.length > 0 && model && (
        <span
          style={{
            fontSize: 10,
            fontFamily: monoStack,
            color: tokens.fgMuted,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap" as const,
          }}
        >
          {model}
        </span>
      )}
      {isAvailable && harness.models.length === 0 && (
        <span
          style={{
            fontSize: 10,
            fontStyle: "italic",
            color: tokens.fgSubtle,
            fontFamily: fontStack,
          }}
        >
          Model configured in app
        </span>
      )}

      {/* Selected indicator */}
      {isSelected && (
        <div
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: tokens.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 8 7 12 13 4" />
          </svg>
        </div>
      )}
    </div>
  );
}
