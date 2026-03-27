import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { readHarnessFile, scanClaudeConfig, writeHarnessFile, saveCustomProfile } from "../../lib/tauri";
import { parseHarness, validateHarnessYaml } from "@harness-kit/core";
import type { HarnessConfig, ValidationResult } from "@harness-kit/core";
import { generateHarnessYaml, HARNESS_TEMPLATE } from "../../lib/harness-generator";
import type { HarnessProfile } from "../../lib/profiles";
import ValidationBanner from "./harness-file/ValidationBanner";
import MetadataSection from "./harness-file/MetadataSection";
import PluginsSection from "./harness-file/PluginsSection";
import McpServersSection from "./harness-file/McpServersSection";
import EnvSection from "./harness-file/EnvSection";
import InstructionsSection from "./harness-file/InstructionsSection";
import PermissionsSection from "./harness-file/PermissionsSection";
import ExtendsSection from "./harness-file/ExtendsSection";
import ProfilePickerModal from "../../components/ProfilePickerModal";

const MonacoEditor = lazy(() => import("../../components/plugin-explorer/MonacoEditor"));

type View = "formatted" | "raw" | "editor";

export default function HarnessFilePage() {
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [found, setFound] = useState(false);
  const [diskContent, setDiskContent] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [view, setView] = useState<View>("formatted");

  // Editor state
  const [editorContent, setEditorContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Empty state action state
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [profilePickerOpen, setProfilePickerOpen] = useState(false);

  // Save-as-profile UI state
  const [profileNameOpen, setProfileNameOpen] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [profileSavedMsg, setProfileSavedMsg] = useState(false);

  const loadHarness = useCallback(() => {
    setLoading(true);
    readHarnessFile()
      .then((result) => {
        setFound(result.found);
        setDiskContent(result.content);
        setFilePath(result.path);
      })
      .catch((e) => setFetchError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadHarness(); }, [loadHarness]);

  const saveable = editorContent !== (diskContent ?? "") && view === "editor";

  const parsed = useMemo<{ config: HarnessConfig; parseError: string | null }>(() => {
    if (!diskContent) return { config: {} as HarnessConfig, parseError: null };
    try {
      const { config } = parseHarness(diskContent);
      return { config, parseError: null };
    } catch (e) {
      return { config: {} as HarnessConfig, parseError: String(e) };
    }
  }, [diskContent]);

  const validation = useMemo<ValidationResult | null>(() => {
    if (!diskContent || parsed.parseError) return null;
    try {
      return validateHarnessYaml(diskContent);
    } catch {
      return null;
    }
  }, [diskContent, parsed.parseError]);

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (saving || !saveable) return;
    setSaving(true);
    setSaveError(null);
    try {
      const savedPath = await writeHarnessFile(editorContent);
      setDiskContent(editorContent);
      setFilePath(savedPath);
      setFound(true);
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  }, [saving, saveable, editorContent]);

  // Cmd+S in editor view
  useEffect(() => {
    if (view !== "editor") return;
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, handleSave]);

  // ── Empty state actions ───────────────────────────────────────────────────

  function openEditor(content: string) {
    setEditorContent(content);
    setView("editor");
    setGenerateError(null);
    setSaveError(null);
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const scan = await scanClaudeConfig();
      const { yaml } = generateHarnessYaml(scan);
      openEditor(yaml);
    } catch (e) {
      setGenerateError(String(e));
      openEditor(HARNESS_TEMPLATE);
    } finally {
      setGenerating(false);
    }
  }

  function handleProfileSelect(profile: HarnessProfile) {
    setProfilePickerOpen(false);
    openEditor(profile.yaml);
  }

  function handleEditCurrent() {
    setEditorContent(diskContent ?? HARNESS_TEMPLATE);
    setView("editor");
    setSaveError(null);
  }

  // ── Save as profile ───────────────────────────────────────────────────────

  async function handleSaveAsProfile() {
    if (!profileNameInput.trim()) return;
    const id = profileNameInput.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!id) return;
    setProfileSaving(true);
    setProfileSaveError(null);
    try {
      await saveCustomProfile(id, diskContent ?? "");
      setProfileSavedMsg(true);
      setProfileNameInput("");
      setProfileNameOpen(false);
      setTimeout(() => setProfileSavedMsg(false), 2500);
    } catch (e) {
      setProfileSaveError(String(e));
    } finally {
      setProfileSaving(false);
    }
  }

  // ── Style helpers ─────────────────────────────────────────────────────────

  const tabBtn = (active: boolean): React.CSSProperties => ({
    fontSize: "10px",
    fontWeight: active ? 600 : 400,
    padding: "3px 8px",
    borderRadius: "4px",
    border: "none",
    background: active ? "var(--bg-elevated)" : "transparent",
    color: active ? "var(--fg-base)" : "var(--fg-subtle)",
    cursor: "pointer",
    boxShadow: active ? "var(--shadow-sm)" : "none",
    transition: "all 0.1s",
  });

  // ── Render ────────────────────────────────────────────────────────────────

  const isFullHeight = view === "editor" && found;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "20px 24px 16px",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        flexShrink: 0,
        borderBottom: isFullHeight ? "1px solid var(--border-base)" : "none",
      }}>
        <div>
          <h1 style={{ fontSize: "17px", fontWeight: 600, letterSpacing: "-0.3px", color: "var(--fg-base)", margin: 0 }}>
            Harness File
          </h1>
          <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: "3px 0 0" }}>
            The single source of truth for your AI assistant configuration.
          </p>
        </div>

        {found && !loading && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0, marginLeft: "16px" }}>
            {/* File path */}
            {filePath && (
              <code style={{ fontSize: "11px", color: "var(--fg-subtle)", fontFamily: "ui-monospace, monospace" }}>
                {filePath}
              </code>
            )}

            {/* Save as Profile button */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => { setProfileNameOpen((v) => !v); setProfileSaveError(null); }}
                style={{
                  display: "flex", alignItems: "center", gap: "4px",
                  padding: "4px 10px", borderRadius: "6px",
                  border: "1px solid var(--border-base)",
                  background: "var(--bg-elevated)",
                  color: "var(--fg-subtle)", fontSize: "11px",
                  cursor: "pointer", whiteSpace: "nowrap",
                }}
                title="Save current harness as a reusable profile"
              >
                Save as profile
              </button>
              {profileSavedMsg && (
                <span style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, fontSize: "11px", color: "var(--accent)", whiteSpace: "nowrap" }}>
                  Profile saved!
                </span>
              )}
              {profileNameOpen && (
                <div style={{
                  position: "absolute", top: "calc(100% + 6px)", right: 0,
                  background: "var(--bg-surface)", border: "1px solid var(--border-base)",
                  borderRadius: "8px", padding: "10px 12px",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
                  zIndex: 50, minWidth: "220px",
                  display: "flex", flexDirection: "column", gap: "8px",
                }}>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--fg-base)" }}>Profile name</span>
                  <input
                    autoFocus
                    type="text"
                    value={profileNameInput}
                    onChange={(e) => setProfileNameInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveAsProfile(); if (e.key === "Escape") setProfileNameOpen(false); }}
                    placeholder="e.g. my-setup"
                    style={{
                      padding: "5px 8px", borderRadius: "5px",
                      border: "1px solid var(--border-base)",
                      background: "var(--bg-elevated)",
                      color: "var(--fg-base)", fontSize: "12px", outline: "none",
                    }}
                  />
                  {profileSaveError && <span style={{ fontSize: "10px", color: "var(--danger)" }}>{profileSaveError}</span>}
                  <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                    <button onClick={() => setProfileNameOpen(false)} style={{ padding: "4px 10px", borderRadius: "5px", border: "1px solid var(--border-base)", background: "transparent", color: "var(--fg-subtle)", fontSize: "11px", cursor: "pointer" }}>
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveAsProfile}
                      disabled={!profileNameInput.trim() || profileSaving}
                      style={{ padding: "4px 10px", borderRadius: "5px", border: "none", background: profileNameInput.trim() ? "var(--accent)" : "var(--bg-elevated)", color: profileNameInput.trim() ? "var(--accent-text, #fff)" : "var(--fg-subtle)", fontSize: "11px", fontWeight: 600, cursor: profileNameInput.trim() ? "pointer" : "not-allowed" }}
                    >
                      {profileSaving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Edit / Save buttons */}
            {view !== "editor" ? (
              <button
                onClick={handleEditCurrent}
                style={{
                  display: "flex", alignItems: "center", gap: "5px",
                  padding: "4px 10px", borderRadius: "6px",
                  border: "1px solid var(--border-base)",
                  background: "var(--bg-elevated)",
                  color: "var(--fg-base)", fontSize: "11px", fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
                Edit
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={!saveable || saving}
                style={{
                  padding: "4px 12px", borderRadius: "6px", border: "none",
                  background: saveable && !saving ? "var(--accent)" : "var(--bg-elevated)",
                  color: saveable && !saving ? "var(--accent-text, #fff)" : "var(--fg-subtle)",
                  fontSize: "11px", fontWeight: 600,
                  cursor: saveable && !saving ? "pointer" : "not-allowed",
                }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            )}

            {/* View toggle */}
            <div style={{
              display: "flex", gap: "2px",
              background: "var(--bg-base)", border: "1px solid var(--border-base)",
              borderRadius: "6px", padding: "2px",
            }}>
              <button onClick={() => setView("formatted")} style={tabBtn(view === "formatted")}>Formatted</button>
              <button onClick={() => setView("raw")} style={tabBtn(view === "raw")}>Raw</button>
              <button onClick={() => { setEditorContent(diskContent ?? ""); setView("editor"); }} style={tabBtn(view === "editor")}>Editor</button>
            </div>
          </div>
        )}
      </div>

      {/* Save error (editor view) */}
      {saveError && view === "editor" && (
        <div style={{ padding: "0 24px 8px", flexShrink: 0 }}>
          <span style={{ fontSize: "11px", color: "var(--danger)" }}>{saveError}</span>
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflow: isFullHeight ? "hidden" : "auto", padding: isFullHeight ? 0 : "0 24px 24px" }}>

        {/* Loading */}
        {loading && (
          <p style={{ fontSize: "13px", color: "var(--fg-subtle)", paddingTop: "4px" }}>Loading…</p>
        )}

        {/* Fetch error */}
        {fetchError && (
          <div style={{
            background: "var(--bg-surface)", border: "1px solid var(--border-base)",
            borderRadius: "8px", padding: "10px 14px",
            fontSize: "13px", color: "var(--danger)", marginTop: "4px",
          }}>
            {fetchError}
          </div>
        )}

        {/* Empty state — no harness found, not yet in editor */}
        {!loading && !fetchError && !found && view !== "editor" && (
          <div style={{
            background: "var(--bg-surface)", border: "1px solid var(--border-base)",
            borderRadius: "8px", padding: "32px 24px",
            textAlign: "center", maxWidth: "540px", marginTop: "4px",
          }}>
            <div style={{ fontSize: "28px", marginBottom: "12px" }}>🧰</div>
            <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--fg-base)", margin: "0 0 6px" }}>
              No harness.yaml found
            </h2>
            <p style={{ fontSize: "13px", color: "var(--fg-muted)", margin: "0 0 20px", lineHeight: "1.5" }}>
              A <code style={{ fontFamily: "ui-monospace, monospace", fontSize: "12px" }}>harness.yaml</code> file
              is the single source of truth for your AI assistant configuration — plugins, MCP servers,
              instructions, and permissions in one portable file.
            </p>

            {generateError && (
              <p style={{ margin: "0 0 12px", fontSize: "11px", color: "var(--danger)" }}>{generateError}</p>
            )}

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
              <button
                onClick={handleGenerate}
                disabled={generating}
                style={{
                  padding: "7px 14px", borderRadius: "6px", border: "none",
                  background: "var(--accent)", color: "var(--accent-text, #fff)",
                  fontSize: "12px", fontWeight: 600,
                  cursor: generating ? "not-allowed" : "pointer",
                }}
              >
                {generating ? "Scanning…" : "Generate from Claude Code setup"}
              </button>
              <button
                onClick={() => setProfilePickerOpen(true)}
                style={{
                  padding: "7px 14px", borderRadius: "6px",
                  border: "1px solid var(--border-base)",
                  background: "var(--bg-elevated)", color: "var(--fg-base)",
                  fontSize: "12px", cursor: "pointer",
                }}
              >
                Start from a profile
              </button>
              <button
                onClick={() => openEditor(HARNESS_TEMPLATE)}
                style={{
                  padding: "7px 14px", borderRadius: "6px",
                  border: "1px solid var(--border-base)",
                  background: "var(--bg-elevated)", color: "var(--fg-base)",
                  fontSize: "12px", cursor: "pointer",
                }}
              >
                Create from scratch
              </button>
            </div>
          </div>
        )}

        {/* Editor view (works for both empty and found states) */}
        {view === "editor" && (
          <div style={{ height: found ? "100%" : "480px", display: "flex", flexDirection: "column", marginTop: found ? 0 : "4px" }}>
            {!found && (
              <div style={{ padding: "8px 0 8px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "11px", color: "var(--fg-subtle)" }}>
                  Will save to <code style={{ fontFamily: "ui-monospace, monospace" }}>~/.claude/harness.yaml</code>
                </span>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  {saveError && <span style={{ fontSize: "11px", color: "var(--danger)" }}>{saveError}</span>}
                  <button
                    onClick={handleSave}
                    disabled={!saveable || saving}
                    style={{
                      padding: "5px 14px", borderRadius: "6px", border: "none",
                      background: saveable && !saving ? "var(--accent)" : "var(--bg-elevated)",
                      color: saveable && !saving ? "var(--accent-text, #fff)" : "var(--fg-subtle)",
                      fontSize: "12px", fontWeight: 600,
                      cursor: saveable && !saving ? "pointer" : "not-allowed",
                    }}
                  >
                    {saving ? "Saving…" : "Save harness.yaml"}
                  </button>
                </div>
              </div>
            )}
            <div style={{ flex: 1, overflow: "hidden", border: "1px solid var(--border-base)", borderRadius: found ? 0 : "8px" }}>
              <Suspense fallback={
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: "12px", color: "var(--fg-subtle)" }}>
                  Loading editor…
                </div>
              }>
                <MonacoEditor
                  filePath="harness.yaml"
                  content={editorContent}
                  onChange={setEditorContent}
                  onSave={handleSave}
                />
              </Suspense>
            </div>
          </div>
        )}

        {/* Found — formatted / raw views */}
        {!loading && !fetchError && found && diskContent && view !== "editor" && (
          <>
            {/* Parse error */}
            {parsed.parseError && (
              <div style={{
                background: "var(--bg-surface)", border: "1px solid var(--border-base)",
                borderRadius: "8px", padding: "10px 14px",
                fontSize: "13px", color: "var(--danger)", marginBottom: "16px", marginTop: "4px",
              }}>
                {parsed.parseError}
              </div>
            )}

            {view === "formatted" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "20px", paddingTop: "4px" }}>
                {validation && <ValidationBanner result={validation} />}
                {parsed.config.metadata && <MetadataSection metadata={parsed.config.metadata} />}
                {parsed.config.plugins && parsed.config.plugins.length > 0 && (
                  <PluginsSection plugins={parsed.config.plugins} />
                )}
                {parsed.config["mcp-servers"] && Object.keys(parsed.config["mcp-servers"]).length > 0 && (
                  <McpServersSection servers={parsed.config["mcp-servers"]} />
                )}
                {parsed.config.env && parsed.config.env.length > 0 && (
                  <EnvSection env={parsed.config.env} />
                )}
                {parsed.config.instructions && (
                  <InstructionsSection instructions={parsed.config.instructions} />
                )}
                {parsed.config.permissions && (
                  <PermissionsSection permissions={parsed.config.permissions} />
                )}
                {parsed.config.extends && parsed.config.extends.length > 0 && (
                  <ExtendsSection extends_={parsed.config.extends} />
                )}
              </div>
            ) : (
              <div style={{
                background: "var(--bg-surface)", border: "1px solid var(--border-base)",
                borderRadius: "8px", padding: "14px 16px",
                overflowX: "auto", marginTop: "4px",
              }}>
                <pre style={{
                  margin: 0, fontFamily: "ui-monospace, monospace",
                  fontSize: "11px", lineHeight: "1.6",
                  color: "var(--fg-muted)", whiteSpace: "pre-wrap", wordBreak: "break-word",
                }}>
                  {diskContent}
                </pre>
              </div>
            )}
          </>
        )}
      </div>

      {/* Profile picker modal */}
      <ProfilePickerModal
        open={profilePickerOpen}
        onClose={() => setProfilePickerOpen(false)}
        onSelect={handleProfileSelect}
      />
    </div>
  );
}
