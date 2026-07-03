import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Input } from "@harness-kit/ui";
import { readHarnessFile, scanClaudeConfig, writeHarnessFile, saveCustomProfile } from "../../lib/tauri";
import { parseHarness, validateHarnessYaml } from "@harness-kit/core";
import type { HarnessConfig, ValidationResult } from "@harness-kit/core";
import { generateHarnessYaml, HARNESS_TEMPLATE } from "../../lib/harness-generator";
import type { HarnessProfile } from "../../lib/profiles";
import { getAvailableViewModes } from "../../lib/viewModes";
import EditorToolbar from "../../components/file-explorer/EditorToolbar";
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
  const navigate = useNavigate();
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

  // ── Save ──────────────────────────────────────────────────────

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

  // ── Empty state actions ───────────────────────────────────────

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

  // ── View mode change (populate editor content when switching to editor) ──

  function handleViewModeChange(mode: string) {
    if (mode === "editor") {
      setEditorContent(diskContent ?? HARNESS_TEMPLATE);
      setSaveError(null);
    }
    setView(mode as View);
  }

  // ── Save as profile ───────────────────────────────────────────

  async function handleSaveAsProfile() {
    if (!profileNameInput.trim()) return;
    const id = profileNameInput.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
    if (!id) return;
    setProfileSaving(true);
    setProfileSaveError(null);
    try {
      await saveCustomProfile(id, view === "editor" ? editorContent : (diskContent ?? ""));
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

  // ── Toolbar actions ──────────────────────────────────────────

  const toolbarActions = found && !loading ? (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      {/* Sync */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/harness/sync")}
        title="Sync harness.yaml to platform config files"
      >
        <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor" style={{ marginRight: 4 }}>
          <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
        </svg>
        Sync
      </Button>
      {/* Save as Profile */}
      <div style={{ position: "relative" }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setProfileNameOpen((v) => !v); setProfileSaveError(null); }}
          title="Save current harness as a reusable profile"
        >
          Save as profile
        </Button>
        {profileSavedMsg && (
          <span style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, fontSize: "11px", color: "var(--accent)", whiteSpace: "nowrap", zIndex: 50 }}>
            Profile saved
          </span>
        )}
        {profileNameOpen && (
          <Card
            padding="sm"
            style={{
              position: "absolute", top: "calc(100% + 6px)", right: 0,
              boxShadow: "var(--shadow-md)",
              zIndex: 50, minWidth: "220px",
              display: "flex", flexDirection: "column", gap: "8px",
            }}
          >
            <Input
              autoFocus
              label="Profile name"
              value={profileNameInput}
              onChange={(e) => setProfileNameInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveAsProfile(); if (e.key === "Escape") setProfileNameOpen(false); }}
              placeholder="e.g. my-setup"
              error={Boolean(profileSaveError)}
              helperText={profileSaveError ?? undefined}
            />
            <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
              <Button variant="ghost" size="sm" onClick={() => setProfileNameOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveAsProfile}
                disabled={!profileNameInput.trim() || profileSaving}
              >
                {profileSaving ? "Saving…" : "Save"}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  ) : undefined;

  // ── Render ────────────────────────────────────────────────────

  const isFullHeight = view === "editor" && found;
  const viewModes = getAvailableViewModes("harness.yaml", true);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Standardized toolbar */}
      {found && !loading && (
        <EditorToolbar
          filePath="harness.yaml"
          subtitle={filePath ?? undefined}
          isDirty={saveable}
          saving={saving}
          viewMode={view}
          availableModes={viewModes}
          onViewModeChange={handleViewModeChange}
          onSave={handleSave}
          actions={toolbarActions}
        />
      )}

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
          <p style={{ fontSize: "13px", color: "var(--fg-subtle)", paddingTop: "4px" }}>Loading...</p>
        )}

        {/* Fetch error */}
        {fetchError && (
          <Card padding="sm" style={{ fontSize: "13px", color: "var(--danger)", marginTop: "4px" }}>
            {fetchError}
          </Card>
        )}

        {/* Empty state — no harness found, not yet in editor */}
        {!loading && !fetchError && !found && view !== "editor" && (
          <Card padding="lg" style={{ textAlign: "center", maxWidth: "540px", marginTop: "4px" }}>
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
              <Button variant="primary" onClick={handleGenerate} disabled={generating}>
                {generating ? "Scanning…" : "Generate from Claude Code setup"}
              </Button>
              <Button variant="ghost" onClick={() => setProfilePickerOpen(true)}>
                Start from a profile
              </Button>
              <Button variant="ghost" onClick={() => openEditor(HARNESS_TEMPLATE)}>
                Create from scratch
              </Button>
            </div>
          </Card>
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
                  <Button variant="primary" size="sm" onClick={handleSave} disabled={!saveable || saving}>
                    {saving ? "Saving…" : "Save harness.yaml"}
                  </Button>
                </div>
              </div>
            )}
            <div style={{ flex: 1, overflow: "hidden", borderRadius: found ? 0 : "8px" }}>
              <Suspense fallback={
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: "12px", color: "var(--fg-subtle)" }}>
                  Loading editor...
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
              <Card padding="sm" style={{ fontSize: "13px", color: "var(--danger)", marginBottom: "16px", marginTop: "4px" }}>
                {parsed.parseError}
              </Card>
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
              <Card padding="md" style={{ overflowX: "auto", marginTop: "4px" }}>
                <pre style={{
                  margin: 0, fontFamily: "ui-monospace, monospace",
                  fontSize: "11px", lineHeight: "1.6",
                  color: "var(--fg-muted)", whiteSpace: "pre-wrap", wordBreak: "break-word",
                }}>
                  {diskContent}
                </pre>
              </Card>
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
