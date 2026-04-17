import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import Tooltip from "../components/Tooltip";
import { NAV_SECTIONS } from "../layouts/AppLayout";
import {
  getFontSize, setFontSize, FONT_SIZE_MIN, FONT_SIZE_MAX,
  getDensity, setDensity,
  getDefaultSection, setDefaultSection,
  getHiddenSections, setHiddenSections,
  getObservatoryRefresh, setObservatoryRefresh,
  getMarkdownFont, setMarkdownFont,
  getConfirmSave, setConfirmSave,
  getMembrainEnabled, setMembrainEnabled,
  getConfigFilesDetailLevel, setConfigFilesDetailLevel,
  type Density,
  type MarkdownFont,
  type ConfigFilesDetailLevel,
} from "../lib/preferences";
import {
  getTheme, setTheme,
  getAccent, setAccent,
  ACCENT_PRESETS,
  type AccentName,
} from "../lib/theme";

interface UpdateStatus {
  localSha: string;
  remoteSha: string;
  commitsBehind: number;
  upToDate: boolean;
  error: string | null;
}

// ── Local helper components ─────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: "10px",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      color: "var(--fg-subtle)",
      margin: "0 0 12px",
    }}>
      {children}
    </p>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "10px 0",
      borderBottom: "1px solid var(--separator)",
      gap: "24px",
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--fg-base)" }}>
          {label}
        </div>
        {description && (
          <div style={{ fontSize: "11px", color: "var(--fg-muted)", marginTop: "2px" }}>
            {description}
          </div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>
        {children}
      </div>
    </div>
  );
}

function Segmented<T extends string | number | boolean>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div style={{ display: "flex", gap: "4px" }}>
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          onClick={() => onChange(opt.value)}
          style={{
            fontSize: "11px",
            padding: "5px 12px",
            borderRadius: "5px",
            border: "1px solid",
            borderColor: value === opt.value ? "var(--accent)" : "var(--border-base)",
            background: value === opt.value ? "var(--accent-light)" : "transparent",
            color: value === opt.value ? "var(--accent-text)" : "var(--fg-muted)",
            cursor: "pointer",
            fontWeight: value === opt.value ? 600 : 400,
            whiteSpace: "nowrap",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────

export default function PreferencesPage() {
  const [appVersion, setAppVersion] = useState("0.0.0");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  useEffect(() => {
    const repoPath = import.meta.env.VITE_REPO_PATH;
    const installedSha = import.meta.env.VITE_GIT_SHA;
    if (!repoPath || !installedSha || installedSha === "unknown") return;
    setUpdateChecking(true);
    invoke<UpdateStatus>("check_for_updates", { repoPath, installedSha })
      .then(setUpdateStatus)
      .catch(() => {})
      .finally(() => setUpdateChecking(false));
  }, []);

  const [theme, setThemeState] = useState(getTheme);
  const [accent, setAccentState] = useState(getAccent);
  const [fontSize, setFontSizeState] = useState(getFontSize);
  const [density, setDensityState] = useState(getDensity);
  const [defaultSection, setDefaultSectionState] = useState(getDefaultSection);
  const [hiddenSections, setHiddenSectionsState] = useState(getHiddenSections);
  const [observatoryRefresh, setObservatoryRefreshState] = useState(getObservatoryRefresh);
  const [markdownFont, setMarkdownFontState] = useState(getMarkdownFont);
  const [confirmSave, setConfirmSaveState] = useState(getConfirmSave);
  const [membrainEnabled, setMembrainEnabledState] = useState(getMembrainEnabled);
  const [configFilesDetail, setConfigFilesDetailState] = useState(getConfigFilesDetailLevel);

  function handleSetTheme(t: "light" | "dark" | "system") {
    setTheme(t);
    setThemeState(t);
  }

  function handleSetAccent(name: AccentName) {
    setAccent(name);
    setAccentState(name);
  }

  function handleFontSizeChange(delta: number) {
    const next = fontSize + delta;
    if (next < FONT_SIZE_MIN || next > FONT_SIZE_MAX) return;
    setFontSize(next);
    setFontSizeState(next);
  }

  function handleSetDensity(d: Density) {
    setDensity(d);
    setDensityState(d);
  }

  function handleDefaultSection(path: string) {
    setDefaultSection(path);
    setDefaultSectionState(path);
  }

  function handleToggleSection(sectionId: string) {
    const next = new Set(hiddenSections);
    if (next.has(sectionId)) {
      next.delete(sectionId);
    } else {
      const visibleCount = NAV_SECTIONS.length - next.size;
      if (visibleCount <= 1) return;
      next.add(sectionId);
      // Reset default section if it was just hidden
      const hiddenSection = NAV_SECTIONS.find(s => s.id === sectionId);
      if (hiddenSection && defaultSection === hiddenSection.path) {
        const firstVisible = NAV_SECTIONS.find(s => !next.has(s.id));
        if (firstVisible) handleDefaultSection(firstVisible.path);
      }
    }
    setHiddenSections(next);
    setHiddenSectionsState(next);
  }

  function handleSetObservatoryRefresh(ms: number) {
    setObservatoryRefresh(ms);
    setObservatoryRefreshState(ms);
  }

  function handleSetMarkdownFont(font: MarkdownFont) {
    setMarkdownFont(font);
    setMarkdownFontState(font);
  }

  function handleSetConfirmSave(value: boolean) {
    setConfirmSave(value);
    setConfirmSaveState(value);
  }

  function handleSetMembrainEnabled(value: boolean) {
    setMembrainEnabled(value);
    setMembrainEnabledState(value);
  }

  function handleSetConfigFilesDetail(level: ConfigFilesDetailLevel) {
    setConfigFilesDetailLevel(level);
    setConfigFilesDetailState(level);
  }

  async function handleRebuild() {
    const repoPath = import.meta.env.VITE_REPO_PATH;
    if (!repoPath) return;
    setRebuilding(true);
    setBuildError(null);
    try {
      await invoke("trigger_rebuild", { repoPath });
      // On success the app restarts — this line is never reached
    } catch (err) {
      setBuildError(typeof err === "string" ? err : "Build failed. Check that pnpm is installed.");
      setRebuilding(false);
    }
    // Don't set rebuilding false on success — the app restarts
  }

  // Compute whether each section pill should be disabled (last visible)
  const visibleCount = NAV_SECTIONS.filter((s) => !hiddenSections.has(s.id)).length;

  return (
    <div style={{ padding: "20px 24px", maxWidth: "640px" }}>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{
          fontSize: "17px",
          fontWeight: 600,
          letterSpacing: "-0.3px",
          color: "var(--fg-base)",
          margin: 0,
        }}>
          Preferences
        </h1>
        <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: "3px 0 0" }}>
          Customize your harness-kit experience
        </p>
      </div>

      {/* ── Appearance ─────────────────────────────────────────── */}
      <div style={{ marginBottom: "28px" }}>
        <SectionHeader>Appearance</SectionHeader>

        <SettingRow label="Theme" description="Choose light, dark, or match your system">
          <Segmented
            options={[
              { value: "light" as const, label: "Light" },
              { value: "system" as const, label: "System" },
              { value: "dark" as const, label: "Dark" },
            ]}
            value={theme}
            onChange={handleSetTheme}
          />
        </SettingRow>

        <SettingRow label="Accent color" description="Applies across the entire interface">
          <div style={{ display: "flex", gap: "6px" }}>
            {(Object.entries(ACCENT_PRESETS) as [AccentName, typeof ACCENT_PRESETS[AccentName]][]).map(([name, preset]) => (
              <Tooltip key={name} content={preset.label}>
                <button
                  onClick={() => handleSetAccent(name)}
                  aria-label={`Accent color: ${preset.label}`}
                  style={{
                    width: "22px",
                    height: "22px",
                    borderRadius: "50%",
                    background: preset.swatch,
                    border: accent === name ? "2px solid var(--fg-base)" : "2px solid transparent",
                    cursor: "pointer",
                    outline: accent === name ? "2px solid var(--accent)" : "none",
                    outlineOffset: "1px",
                    padding: 0,
                  }}
                />
              </Tooltip>
            ))}
          </div>
        </SettingRow>

        <SettingRow label="Font size" description="Base text size for the interface">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={() => handleFontSizeChange(-1)}
              disabled={fontSize <= FONT_SIZE_MIN}
              aria-label="Decrease font size"
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "5px",
                border: "1px solid var(--border-base)",
                background: "var(--bg-elevated)",
                color: "var(--fg-muted)",
                cursor: fontSize <= FONT_SIZE_MIN ? "not-allowed" : "pointer",
                opacity: fontSize <= FONT_SIZE_MIN ? 0.4 : 1,
                fontSize: "14px",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              -
            </button>
            <span style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--fg-base)",
              minWidth: "32px",
              textAlign: "center",
              fontVariantNumeric: "tabular-nums",
            }}>
              {fontSize}px
            </span>
            <button
              onClick={() => handleFontSizeChange(1)}
              disabled={fontSize >= FONT_SIZE_MAX}
              aria-label="Increase font size"
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "5px",
                border: "1px solid var(--border-base)",
                background: "var(--bg-elevated)",
                color: "var(--fg-muted)",
                cursor: fontSize >= FONT_SIZE_MAX ? "not-allowed" : "pointer",
                opacity: fontSize >= FONT_SIZE_MAX ? 0.4 : 1,
                fontSize: "14px",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              +
            </button>
          </div>
        </SettingRow>

        <SettingRow label="Density" description="Control spacing between interface elements">
          <Segmented
            options={[
              { value: "compact" as Density, label: "Compact" },
              { value: "comfortable" as Density, label: "Comfortable" },
            ]}
            value={density}
            onChange={handleSetDensity}
          />
        </SettingRow>
      </div>

      {/* ── Layout ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: "28px" }}>
        <SectionHeader>Layout</SectionHeader>

        <SettingRow label="Default section" description="Page shown when the app opens">
          <select
            className="form-select"
            value={defaultSection}
            onChange={(e) => handleDefaultSection(e.target.value)}
            style={{ width: "auto", minWidth: "140px" }}
          >
            {NAV_SECTIONS.filter(s => !hiddenSections.has(s.id)).map((s) => (
              <option key={s.id} value={s.path}>
                {s.label}
              </option>
            ))}
          </select>
        </SettingRow>

        <SettingRow label="Visible sections" description="Toggle which sections appear in the sidebar">
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {NAV_SECTIONS.map((s) => {
              const isHidden = hiddenSections.has(s.id);
              const isVisible = !isHidden;
              const isLastVisible = isVisible && visibleCount <= 1;
              return (
                <button
                  key={s.id}
                  onClick={() => handleToggleSection(s.id)}
                  disabled={isLastVisible}
                  aria-pressed={isVisible}
                  style={{
                    fontSize: "11px",
                    fontWeight: isVisible ? 500 : 400,
                    padding: "3px 10px",
                    borderRadius: "12px",
                    border: "1px solid",
                    borderColor: isVisible ? "var(--accent)" : "var(--border-base)",
                    background: isVisible ? "var(--accent-light)" : "transparent",
                    color: isVisible ? "var(--accent-text)" : "var(--fg-muted)",
                    cursor: isLastVisible ? "not-allowed" : "pointer",
                    opacity: isLastVisible ? 0.5 : 1,
                    textDecoration: isHidden ? "line-through" : "none",
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </SettingRow>
      </div>

      {/* ── Behavior ───────────────────────────────────────────── */}
      <div style={{ marginBottom: "28px" }}>
        <SectionHeader>Behavior</SectionHeader>

        <SettingRow label="Observatory auto-refresh" description="How often the dashboard reloads data">
          <Segmented
            options={[
              { value: 0, label: "Off" },
              { value: 30000, label: "30s" },
              { value: 60000, label: "1m" },
              { value: 300000, label: "5m" },
            ]}
            value={observatoryRefresh}
            onChange={handleSetObservatoryRefresh}
          />
        </SettingRow>

        <SettingRow
          label="Confirm before saving"
          description="Critical config files always require confirmation"
        >
          <Segmented
            options={[
              { value: true, label: "On" },
              { value: false, label: "Off" },
            ]}
            value={confirmSave}
            onChange={handleSetConfirmSave}
          />
        </SettingRow>
      </div>

      {/* ── Content ────────────────────────────────────────────── */}
      <div style={{ marginBottom: "28px" }}>
        <SectionHeader>Content</SectionHeader>

        <SettingRow label="Markdown font" description="Font family used in rendered markdown">
          <Segmented
            options={[
              { value: "sans" as MarkdownFont, label: "Sans-serif" },
              { value: "mono" as MarkdownFont, label: "Monospace" },
            ]}
            value={markdownFont}
            onChange={handleSetMarkdownFont}
          />
        </SettingRow>
      </div>

      {/* ── Config File Explorer ─────────────────────────────────── */}
      <div style={{ marginBottom: "28px" }}>
        <SectionHeader>Config File Explorer</SectionHeader>

        <SettingRow
          label="File visibility"
          description="Which files appear in the ~/.claude/ editor"
        >
          <Segmented
            options={[
              { value: "essentials" as ConfigFilesDetailLevel, label: "Essentials" },
              { value: "text-files" as ConfigFilesDetailLevel, label: "Text Files" },
              { value: "all" as ConfigFilesDetailLevel, label: "All" },
            ]}
            value={configFilesDetail}
            onChange={handleSetConfigFilesDetail}
          />
        </SettingRow>
      </div>

      {/* ── Labs ───────────────────────────────────────────────── */}
      <div style={{ marginBottom: "28px" }}>
        <SectionHeader>Labs</SectionHeader>

        <SettingRow
          label="Memory"
          description="Connect to your local membrain knowledge graph. Personal use — requires mem binary."
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              padding: "2px 6px",
              borderRadius: 4,
              background: "var(--accent-light)",
              color: "var(--accent-text)",
              border: "1px solid var(--accent)",
            }}>
              Alpha
            </span>
            <Segmented
              options={[
                { value: false, label: "Off" },
                { value: true, label: "On" },
              ]}
              value={membrainEnabled}
              onChange={handleSetMembrainEnabled}
            />
          </div>
        </SettingRow>
      </div>

      {/* ── Updates ────────────────────────────────────────────────────────────── */}
      {import.meta.env.VITE_REPO_PATH && (
        <div style={{ marginBottom: "28px" }}>
          <SectionHeader>Updates</SectionHeader>

          <div style={{
            padding: "10px 0",
            borderBottom: "1px solid var(--separator)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "24px",
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--fg-base)" }}>
                {updateChecking
                  ? "Checking for updates..."
                  : updateStatus?.error
                    ? "Update check unavailable"
                    : updateStatus?.upToDate
                      ? "Up to date"
                      : `${updateStatus?.commitsBehind} commit${updateStatus?.commitsBehind === 1 ? "" : "s"} behind main`}
              </div>
              {!updateChecking && !updateStatus?.error && import.meta.env.VITE_GIT_SHA && import.meta.env.VITE_GIT_SHA !== "unknown" && (
                <div style={{ fontSize: "11px", color: "var(--fg-muted)", marginTop: "2px", fontFamily: "monospace" }}>
                  {import.meta.env.VITE_GIT_SHA.slice(0, 7)}
                </div>
              )}
              {rebuilding && (
                <div style={{ fontSize: "11px", color: "var(--fg-muted)", marginTop: "4px" }}>
                  Building... this takes a few minutes. The app will restart when ready.
                </div>
              )}
              {buildError && (
                <div style={{
                  fontSize: "11px",
                  color: "var(--fg-muted)",
                  marginTop: "4px",
                  fontFamily: "monospace",
                  whiteSpace: "pre-wrap",
                  maxHeight: "80px",
                  overflow: "auto",
                }}>
                  {buildError}
                </div>
              )}
              {updateStatus?.error && (
                <div style={{ fontSize: "11px", color: "var(--fg-muted)", marginTop: "2px" }}>
                  {updateStatus.error}
                </div>
              )}
            </div>
            <div style={{ flexShrink: 0 }}>
              {(!updateStatus?.upToDate || rebuilding || buildError) && !updateStatus?.error && !updateChecking && (
                <button
                  onClick={handleRebuild}
                  disabled={rebuilding}
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    padding: "6px 14px",
                    borderRadius: "6px",
                    border: "1px solid var(--accent)",
                    background: rebuilding ? "var(--bg-elevated)" : "var(--accent-light)",
                    color: rebuilding ? "var(--fg-muted)" : "var(--accent-text)",
                    cursor: rebuilding ? "not-allowed" : "pointer",
                    opacity: rebuilding ? 0.6 : 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  {rebuilding ? "Building..." : buildError ? "Retry" : "Rebuild & Relaunch"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── About ──────────────────────────────────────────────── */}
      <div>
        <SectionHeader>About</SectionHeader>

        <div style={{
          padding: "10px 0",
          borderBottom: "1px solid var(--separator)",
        }}>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg-base)" }}>
            harness-kit
          </span>
          <span style={{ fontSize: "12px", color: "var(--fg-muted)", marginLeft: "6px" }}>
            v{appVersion}
          </span>
        </div>

        <div style={{
          display: "flex",
          gap: "16px",
          padding: "10px 0",
        }}>
          <button
            onClick={() => open("https://github.com/harnessprotocol/harness-kit/releases")}
            style={{
              fontSize: "12px",
              color: "var(--accent-text)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              textDecoration: "underline",
              textUnderlineOffset: "2px",
            }}
          >
            Release notes
          </button>
          <button
            onClick={() => open("https://github.com/harnessprotocol/harness-kit")}
            style={{
              fontSize: "12px",
              color: "var(--accent-text)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              textDecoration: "underline",
              textUnderlineOffset: "2px",
            }}
          >
            GitHub
          </button>
        </div>
      </div>
    </div>
  );
}
