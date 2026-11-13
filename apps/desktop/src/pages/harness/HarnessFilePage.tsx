import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, Card, ErrorNotice, Input } from "@harness-kit/ui";
import { Share2 } from "lucide-react";
import { writeHarnessFile, saveCustomProfile } from "../../lib/tauri";
import { describeHarnessSource, readHarnessSource } from "../../lib/harness-source";
import { LEGACY_HARNESS_NOTICE } from "../../lib/legacy-harness-notice";
import { projectDirLabel, useProjectDir } from "../../lib/project-dir";
import { importPersonalHarness } from "../../lib/personal-inventory";
import { parseHarness, validateHarnessYaml } from "@harness-kit/core";
import type { HarnessConfig, ValidationResult } from "@harness-kit/core";
import { HARNESS_TEMPLATE } from "../../lib/harness-generator";
import type { HarnessProfile } from "../../lib/profiles";
import { applyYamlPatch, remapPatch } from "../../lib/harness-yaml-patch";
import type { YamlPatch } from "../../lib/harness-yaml-patch";
import { getAvailableViewModes } from "../../lib/viewModes";
import { useRegisterCommands } from "../../lib/commands";
import { errorDetails } from "../../lib/error-details";
import { loadedDigest } from "../../lib/loaded-digest";
import EditorToolbar from "../../components/file-explorer/EditorToolbar";
import ValidationBanner from "./harness-file/ValidationBanner";
import ProfilePanel from "./harness-file/ProfilePanel";
import ShareSheet from "./ShareSheet";
import ResizableSplit from "../../components/ResizableSplit";
import ProfilePickerModal from "../../components/ProfilePickerModal";

const MonacoEditor = lazy(() => import("../../components/plugin-explorer/MonacoEditor"));
const SyncPage = lazy(() => import("./SyncPage"));

/** How long after the last keystroke the panel re-reads the YAML. */
const PANEL_DEBOUNCE_MS = 250;

type View = "formatted" | "raw" | "editor";
type Tab = "file" | "compile";

const SR_ONLY = {
  position: "absolute", width: 1, height: 1, margin: -1, padding: 0, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap",
} as const;

interface HarnessFilePageProps {
  /** Profile's tab: harness.yaml (default) or Compile to project (AC-24). */
  tab?: Tab;
}

export default function HarnessFilePage({ tab: tabProp }: HarnessFilePageProps = {}) {
  const navigate = useNavigate();
  // One route (`harness/file/*`) serves both tabs, so switching tabs keeps this
  // page, and the unsaved editor buffer, mounted.
  const { pathname } = useLocation();
  const tab: Tab = tabProp ?? (/\/compile\/?$/.test(pathname) ? "compile" : "file");
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [found, setFound] = useState(false);
  const [diskContent, setDiskContent] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [view, setView] = useState<View>("formatted");

  // A file at ~/harness.yaml with none at ~/.claude/harness.yaml (existence only).
  const [legacyHomeFile, setLegacyHomeFile] = useState(false);

  // Editor state
  const [editorContent, setEditorContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Empty state action state (AC-22): a scan's YAML waits here, read-only,
  // until the user writes it.
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [scanned, setScanned] = useState<string | null>(null);
  const [scanWriting, setScanWriting] = useState(false);
  const [scanWriteError, setScanWriteError] = useState<string | null>(null);
  const [profilePickerOpen, setProfilePickerOpen] = useState(false);

  // AC-23: the structured panel reads this text, a moment behind the editor.
  const [panelText, setPanelTextState] = useState("");
  // The text the panel shows (or is about to), readable between renders.
  const panelTextRef = useRef("");
  const setPanelText = useCallback((text: string) => {
    panelTextRef.current = text;
    setPanelTextState(text);
  }, []);
  const savingRef = useRef(false);
  const [patchError, setPatchError] = useState<string | null>(null);
  const [loadTick, setLoadTick] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const bufferRef = useRef("");
  const panelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Save-as-profile UI state
  const [profileNameOpen, setProfileNameOpen] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [profileSavedMsg, setProfileSavedMsg] = useState(false);

  // AC-55: Profile follows the title-bar project. With one chosen it shows that
  // project's committed harness.yaml (the team baseline), read-only; without
  // one it is the editable personal ~/.claude/harness.yaml.
  const [projectDir] = useProjectDir();
  const source = describeHarnessSource(projectDir);
  const readOnly = source.kind === "project";

  // A read still in flight for the previous project must not land on the new one.
  const loadGeneration = useRef(0);
  const loadHarness = useCallback(() => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setFetchError(null);
    readHarnessSource(projectDir)
      .then((result) => {
        if (generation !== loadGeneration.current) return;
        setFound(result.found);
        setLegacyHomeFile(result.legacy_home_file === true);
        setDiskContent(result.content);
        setFilePath(result.path);
        setLoadTick((n) => n + 1);
      })
      .catch((e) => {
        if (generation !== loadGeneration.current) return;
        setFound(false);
        setLegacyHomeFile(false);
        setDiskContent(null);
        setFilePath(null);
        setFetchError(errorDetails(e));
        // The user's choice to discard applied to this read, which failed.
        forceLoad.current = false;
      })
      .finally(() => {
        if (generation === loadGeneration.current) setLoading(false);
      });
  }, [projectDir]);

  useEffect(() => {
    // A new scope starts from the formatted view: the editor belongs to the
    // personal file and holds its text.
    setView("formatted");
    setSaveError(null);
    loadHarness();
  }, [loadHarness]);

  // A personal harness.yaml that exists shows the editor and the panel side by
  // side (AC-23). The team baseline stays a read-only view.
  const split = found && !readOnly;
  const editing = split || view === "editor";
  const saveable = editing && editorContent !== (diskContent ?? "");

  function setBuffer(next: string) {
    bufferRef.current = next;
    setEditorContent(next);
  }

  // The disk text the buffer was last in step with (null before the first load).
  // A buffer that differs from it holds unsaved edits.
  const syncedRef = useRef<string | null>(null);
  // Set by an explicit "Reload from disk", which is the user's choice to discard.
  const forceLoad = useRef(false);
  // A disk version that arrived while the buffer held unsaved edits.
  const [pendingDisk, setPendingDisk] = useState<string | null>(null);

  function applyDisk(text: string) {
    // A keystroke just before this must not re-read its stale text into the panel.
    if (panelTimer.current) clearTimeout(panelTimer.current);
    syncedRef.current = text;
    setBuffer(text);
    setPanelText(text);
    setPatchError(null);
    setPendingDisk(null);
  }

  // A load (first, Reload from disk, a project change and back) replaces what
  // the editor holds, unless that would discard unsaved edits: then it asks.
  // A layout effect: no render shows the loaded file next to a not-yet-synced buffer.
  useLayoutEffect(() => {
    if (!found || readOnly) return;
    const text = diskContent ?? "";
    const dirty = syncedRef.current !== null && bufferRef.current !== syncedRef.current && bufferRef.current !== text;
    if (dirty && !forceLoad.current) {
      setPendingDisk(text);
      return;
    }
    forceLoad.current = false;
    applyDisk(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadTick]);

  useEffect(() => () => {
    if (panelTimer.current) clearTimeout(panelTimer.current);
  }, []);

  function handleEditorChange(next: string) {
    setBuffer(next);
    if (!split) return;
    if (panelTimer.current) clearTimeout(panelTimer.current);
    panelTimer.current = setTimeout(() => setPanelText(next), PANEL_DEBOUNCE_MS);
  }

  // A panel edit patches the YAML text, so Monaco shows it and comments stay.
  function handlePatch(patch: YamlPatch) {
    try {
      // The panel can be up to PANEL_DEBOUNCE_MS behind the editor, and its
      // index paths refer to what it showed: point them at the same entries.
      const current = bufferRef.current;
      const shown = panelTextRef.current;
      const stale = shown !== current;
      if (stale && panelTimer.current) clearTimeout(panelTimer.current);
      let resolved: YamlPatch;
      try {
        resolved = stale ? remapPatch(shown, current, patch) : patch;
      } catch (e) {
        setPanelText(current);
        throw new Error(`${errorDetails(e)}. The panel has refreshed; try the edit again.`);
      }
      const next = applyYamlPatch(current, resolved);
      if (panelTimer.current) clearTimeout(panelTimer.current);
      setBuffer(next);
      setPanelText(next);
      setPatchError(null);
    } catch (e) {
      setPatchError(errorDetails(e));
    }
  }

  // What the panel and Share read: the live text while editing, the file otherwise.
  const shownText = split ? panelText : diskContent;
  const parsed = useMemo<{ config: HarnessConfig; parseError: string | null }>(() => {
    if (!shownText) return { config: {} as HarnessConfig, parseError: null };
    try {
      const { config } = parseHarness(shownText);
      return { config, parseError: null };
    } catch (e) {
      return { config: {} as HarnessConfig, parseError: errorDetails(e) };
    }
  }, [shownText]);

  const validation = useMemo<ValidationResult | null>(() => {
    if (!shownText || parsed.parseError) return null;
    try {
      return validateHarnessYaml(shownText);
    } catch {
      return null;
    }
  }, [shownText, parsed.parseError]);

  // Share (AC-25) works from what is on screen, including unsaved edits.
  const shareSource = split ? editorContent : diskContent;
  const share = useMemo<{ config: HarnessConfig | null; error: string | null }>(() => {
    if (!found || !shareSource) return { config: null, error: null };
    try {
      const config = parseHarness(shareSource).config as unknown;
      if (typeof config !== "object" || config === null || Array.isArray(config)) {
        return { config: null, error: "The top level of harness.yaml is not a mapping." };
      }
      return { config: config as HarnessConfig, error: null };
    } catch (e) {
      return { config: null, error: errorDetails(e) };
    }
  }, [found, shareSource]);

  // ── Save ──────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    // A ref: a second save sent before this render's `saving` updates must be ignored.
    if (savingRef.current || !saveable) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    // What is written is what the buffer holds now, not what this render saw.
    const content = bufferRef.current;
    try {
      // AC-50: the digest is of the file at the write target; `undefined`
      // when the page found no file there (AC-55: the personal profile is
      // ~/.claude/harness.yaml and nothing else).
      // It is of the text the buffer was last in step with, never of a disk
      // version still waiting in `pendingDisk`: Save must not overwrite that
      // one without asking.
      const expected = filePath === "~/.claude/harness.yaml" ? await loadedDigest(syncedRef.current ?? diskContent) : undefined;
      const savedPath = await writeHarnessFile(content, expected);
      setDiskContent(content);
      // An edit made while the write ran stays in the buffer; the panel follows it.
      setPanelText(bufferRef.current);
      syncedRef.current = content;
      setPendingDisk(null);
      setFilePath(savedPath);
      setFound(true);
    } catch (e) {
      setSaveError(errorDetails(e));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [saveable, filePath, diskContent, setPanelText]);

  // Cmd+S while the editor is open. A panel field commits on blur, so blur it
  // first (synchronously) or the save would leave out what is being typed.
  const saveRef = useRef(handleSave);
  saveRef.current = handleSave;
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!editing) return;
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        const active = document.activeElement;
        const inPanel = active instanceof HTMLElement && panelRef.current?.contains(active);
        if (inPanel) flushSync(() => (active as HTMLElement).blur());
        void saveRef.current();
        if (inPanel) (active as HTMLElement).focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  // ⌘K (spec AC-21): Save while the editor is open, disabled when the
  // Save buttons are (nothing changed, or a save is running).
  useRegisterCommands(
    editing
      ? [
          {
            id: "profile.save",
            title: "Save harness.yaml",
            group: "Profile",
            keywords: ["write"],
            shortcut: "⌘S",
            disabled: !saveable || saving,
            run: handleSave,
          },
        ]
      : [],
    [editing, saveable, saving],
  );

  // ── Empty state actions ───────────────────────────────────────

  function openEditor(content: string) {
    setBuffer(content);
    setView("editor");
    setGenerateError(null);
    setSaveError(null);
  }

  async function handleScan() {
    setGenerating(true);
    setGenerateError(null);
    try {
      // AC-56: the same machine inventory the Machine grid shows.
      const { harnessYaml } = await importPersonalHarness({
        name: "my-harness",
        description: "Generated from existing Claude Code configuration.",
      });
      setScanned(harnessYaml);
      setScanWriteError(null);
    } catch (e) {
      // Stay on the empty state: opening the blank template here would hide
      // the failure behind an editor that looks like a scan result.
      setGenerateError(errorDetails(e));
    } finally {
      setGenerating(false);
    }
  }

  // AC-22: nothing is written until the user has seen the scan and chosen to.
  async function handleWriteScan() {
    if (scanned === null || scanWriting) return;
    setScanWriting(true);
    setScanWriteError(null);
    try {
      await writeHarnessFile(scanned, undefined);
      setScanned(null);
      loadHarness();
    } catch (e) {
      setScanWriteError(errorDetails(e));
    } finally {
      setScanWriting(false);
    }
  }

  function handleProfileSelect(profile: HarnessProfile) {
    setProfilePickerOpen(false);
    openEditor(profile.yaml);
  }

  // ── View mode change (populate editor content when switching to editor) ──

  function handleViewModeChange(mode: string) {
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
      await saveCustomProfile(id, editing ? editorContent : (diskContent ?? ""));
      setProfileSavedMsg(true);
      setProfileNameInput("");
      setProfileNameOpen(false);
      setTimeout(() => setProfileSavedMsg(false), 2500);
    } catch (e) {
      setProfileSaveError(errorDetails(e));
    } finally {
      setProfileSaving(false);
    }
  }

  // ── Toolbar actions ──────────────────────────────────────────

  const toolbarActions = found && !loading ? (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
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
            />
            {profileSaveError && (
              <ErrorNotice title="Couldn't save the profile" details={profileSaveError} />
            )}
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

  const showFile = tab === "file";
  const viewModes = readOnly ? getAvailableViewModes("harness.yaml", true).filter((mode) => mode.key !== "editor") : [];
  const fullHeight = showFile && split && !loading;
  const shareReason = share.error
    ? `Share is unavailable: harness.yaml does not parse as a profile yet (${share.error}). Fix it in the editor first.`
    : !share.config
      ? "Share is unavailable: harness.yaml is empty."
      : null;

  const editorFallback = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: "12px", color: "var(--fg-subtle)" }}>
      Loading editor...
    </div>
  );

  const tabButtons: Array<{ key: Tab; label: string; path: string }> = [
    { key: "file", label: "harness.yaml", path: "/harness/file" },
    { key: "compile", label: "Compile to project", path: "/harness/file/compile" },
  ];

  function onTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = tabButtons[(tabButtons.findIndex((t) => t.key === tab) + 1) % tabButtons.length];
    navigate(next.path);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header: the scope is always named, since which harness.yaml this page
          shows depends on the title-bar project. */}
      <div style={{ padding: "6px 12px 0 36px", flexShrink: 0, display: "flex", gap: "8px", alignItems: "baseline" }}>
        <span style={{
          fontSize: "10px",
          fontWeight: 600,
          color: "var(--fg-subtle)",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}>
          Profile
        </span>
        <span data-testid="profile-scope" style={{ fontSize: "11px", color: "var(--fg-muted)" }}>
          {source.label}
          {readOnly && " (read-only)"}
        </span>
      </div>

      {/* Tabs (AC-24) and Share (AC-25) */}
      <div style={{ padding: "6px 24px 8px 36px", flexShrink: 0, display: "flex", alignItems: "center", gap: "12px" }}>
        <div
          role="tablist"
          aria-label="Profile"
          style={{ display: "inline-flex", gap: "2px", padding: "2px", borderRadius: "8px", background: "var(--bg-elevated)" }}
        >
          {tabButtons.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`profile-tab-${t.key}`}
              aria-selected={tab === t.key}
              aria-controls="profile-tabpanel"
              tabIndex={tab === t.key ? 0 : -1}
              className="hk-reset-btn"
              onClick={() => navigate(t.path)}
              onKeyDown={onTabKeyDown}
              style={{
                fontSize: "13px",
                fontWeight: tab === t.key ? 600 : 400,
                padding: "5px 12px",
                borderRadius: "6px",
                background: tab === t.key ? "var(--bg-surface)" : "transparent",
                color: tab === t.key ? "var(--fg-base)" : "var(--fg-subtle)",
                boxShadow: tab === t.key ? "var(--shadow-sm)" : "none",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {found && !loading && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShareOpen(true)}
              disabled={shareReason !== null}
              aria-describedby={shareReason ? "share-disabled-reason" : undefined}
              title={shareReason ?? "Share this profile without its secrets"}
            >
              <Share2 size={12} strokeWidth={1.7} style={{ marginRight: 5 }} aria-hidden="true" />
              Share
            </Button>
            {shareReason && <span id="share-disabled-reason" style={SR_ONLY}>{shareReason}</span>}
          </>
        )}
      </div>

      {/* Standardized toolbar */}
      {showFile && found && !loading && (
        <EditorToolbar
          filePath="harness.yaml"
          subtitle={filePath ?? undefined}
          isDirty={saveable}
          saving={saving}
          viewMode={readOnly ? view : "split"}
          availableModes={viewModes}
          onViewModeChange={handleViewModeChange}
          onSave={handleSave}
          actions={toolbarActions}
        />
      )}

      {/* Save error (editor open, whether or not the file exists yet) */}
      {showFile && saveError && editing && (
        <div style={{ padding: "0 24px 8px", flexShrink: 0 }}>
          {saveError.includes("changed on disk") ? (
            <ErrorNotice
              title="harness.yaml changed on disk"
              details={saveError}
              action={{ label: "Reload from disk", onClick: () => { setSaveError(null); forceLoad.current = true; loadHarness(); } }}
            />
          ) : (
            <ErrorNotice
              title="Couldn't save harness.yaml"
              details={saveError}
              action={{ label: "Retry", onClick: () => void handleSave() }}
            />
          )}
        </div>
      )}

      {/* A load landed while the editor held unsaved edits: the edits stay until asked */}
      {showFile && split && pendingDisk !== null && (
        <div style={{ padding: "0 24px 8px", flexShrink: 0 }} data-testid="pending-disk-notice">
          <ErrorNotice
            title="harness.yaml was re-read from disk"
            details="The editor still shows your unsaved edits. Save will not overwrite the disk version without asking. Load the disk version to discard your edits."
            action={{ label: "Discard edits and load from disk", onClick: () => applyDisk(pendingDisk) }}
          />
        </div>
      )}

      {/* Content */}
      <div
        role="tabpanel"
        id="profile-tabpanel"
        aria-labelledby={`profile-tab-${tab}`}
        style={{ flex: 1, overflow: fullHeight ? "hidden" : "auto", padding: fullHeight ? 0 : "0 24px 24px" }}
      >
        {!showFile && (
          <>
            {saveable && (
              <p role="note" data-testid="compile-unsaved-note" style={{ fontSize: "12px", color: "var(--fg-muted)", margin: "0 0 10px" }}>
                harness.yaml has unsaved edits. Compile uses the saved file, so save first.
              </p>
            )}
            <Suspense fallback={<p style={{ fontSize: "13px", color: "var(--fg-subtle)" }}>Loading...</p>}>
              <SyncPage embedded />
            </Suspense>
          </>
        )}

        {/* Loading */}
        {showFile && loading && (
          <p style={{ fontSize: "13px", color: "var(--fg-subtle)", paddingTop: "4px" }}>Loading...</p>
        )}

        {/* Fetch error */}
        {showFile && fetchError && (
          <ErrorNotice
            title="Couldn't read harness.yaml"
            details={fetchError}
            action={{ label: "Retry", onClick: () => { setFetchError(null); loadHarness(); } }}
          />
        )}

        {/* Empty state: a project without a committed harness.yaml */}
        {showFile && !loading && !fetchError && !found && readOnly && (
          <Card padding="lg" style={{ maxWidth: "540px", marginTop: "4px" }}>
            <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--fg-base)", margin: "0 0 6px" }}>
              No harness.yaml in {projectDirLabel(projectDir ?? "")}
            </h2>
            <p style={{ fontSize: "13px", color: "var(--fg-muted)", margin: 0, lineHeight: "1.5" }}>
              The team baseline is the <code style={{ fontFamily: "ui-monospace, monospace", fontSize: "12px" }}>harness.yaml</code> committed
              at the project root. Add one there, or clear the project in the title bar to work on your personal profile.
            </p>
          </Card>
        )}

        {showFile && !loading && !fetchError && !found && !readOnly && legacyHomeFile && (
          <p
            role="note"
            data-testid="legacy-harness-notice"
            style={{ fontSize: "13px", color: "var(--fg-muted)", margin: "0 0 12px" }}
          >
            {LEGACY_HARNESS_NOTICE}
          </p>
        )}

        {/* AC-22: no personal harness.yaml. Scan first, review, then write. */}
        {showFile && !loading && !fetchError && !found && !readOnly && view !== "editor" && scanned === null && (
          <Card padding="lg" style={{ textAlign: "center", maxWidth: "540px", marginTop: "4px" }}>
            <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--fg-base)", margin: "0 0 6px" }}>
              No harness.yaml found
            </h2>
            <p style={{ fontSize: "13px", color: "var(--fg-muted)", margin: "0 0 20px", lineHeight: "1.5" }}>
              A <code style={{ fontFamily: "ui-monospace, monospace", fontSize: "12px" }}>harness.yaml</code> file
              is the single source of truth for your AI assistant configuration: plugins, MCP servers,
              instructions, and permissions in one portable file.
            </p>

            {generateError && (
              <ErrorNotice
                title="Couldn't scan your Claude Code setup"
                details={generateError}
                action={{ label: "Retry scan", onClick: () => void handleScan() }}
              />
            )}

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
              <Button variant="primary" onClick={() => void handleScan()} disabled={generating}>
                {generating ? "Scanning…" : "Scan this machine"}
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

        {/* The scan's result, read-only, until it is written */}
        {showFile && !loading && !fetchError && !found && !readOnly && scanned !== null && (
          <div style={{ marginTop: "4px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div>
              <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--fg-base)", margin: "0 0 4px" }}>
                Review what the scan found
              </h2>
              <p style={{ fontSize: "13px", color: "var(--fg-muted)", margin: 0 }}>
                Nothing is written until you choose Write harness.yaml. It will be saved to{" "}
                <code style={{ fontFamily: "ui-monospace, monospace", fontSize: "12px" }}>~/.claude/harness.yaml</code>.
              </p>
            </div>
            {scanWriteError && (
              <ErrorNotice
                title="Couldn't write harness.yaml"
                details={scanWriteError}
                action={{ label: "Retry", onClick: () => void handleWriteScan() }}
              />
            )}
            <div style={{ display: "flex", gap: "8px" }}>
              <Button variant="primary" onClick={() => void handleWriteScan()} disabled={scanWriting}>
                {scanWriting ? "Writing…" : "Write harness.yaml"}
              </Button>
              <Button variant="ghost" onClick={() => { setScanned(null); setScanWriteError(null); }} disabled={scanWriting}>
                Cancel
              </Button>
            </div>
            <div style={{ height: "420px", borderRadius: "8px", overflow: "hidden" }}>
              <Suspense fallback={editorFallback}>
                <MonacoEditor filePath="harness.yaml" content={scanned} onChange={() => {}} readOnly />
              </Suspense>
            </div>
          </div>
        )}

        {/* Create from scratch / Start from a profile: the editor before the file exists */}
        {showFile && !loading && !found && !readOnly && view === "editor" && (
          <div style={{ height: "480px", display: "flex", flexDirection: "column", marginTop: "4px" }}>
            <div style={{ padding: "8px 0 8px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "11px", color: "var(--fg-subtle)" }}>
                Will save to <code style={{ fontFamily: "ui-monospace, monospace" }}>~/.claude/harness.yaml</code>
              </span>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <Button variant="primary" size="sm" onClick={handleSave} disabled={!saveable || saving}>
                  {saving ? "Saving…" : "Save harness.yaml"}
                </Button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: "hidden", borderRadius: "8px" }}>
              <Suspense fallback={editorFallback}>
                <MonacoEditor filePath="harness.yaml" content={editorContent} onChange={setBuffer} />
              </Suspense>
            </div>
          </div>
        )}

        {/* AC-23: editor and structured panel side by side */}
        {showFile && !loading && !fetchError && split && (
          <ResizableSplit
            storageKey="harness-profile-split"
            defaultWidth={560}
            minWidth={320}
            maxWidth={1400}
            minRightWidth={360}
            handleLabel="Resize editor and panel"
            left={
              <Suspense fallback={editorFallback}>
                <MonacoEditor filePath="harness.yaml" content={editorContent} onChange={handleEditorChange} />
              </Suspense>
            }
            right={
              <div ref={panelRef} style={{ flex: 1, overflowY: "auto", padding: "4px 24px 24px 16px", display: "flex", flexDirection: "column", gap: "20px" }}>
                {patchError && <ErrorNotice title="Couldn't apply that edit" details={patchError} />}
                {parsed.parseError ? (
                  <ErrorNotice title="Couldn't parse harness.yaml" details={parsed.parseError} />
                ) : (
                  <>
                    {validation && <ValidationBanner result={validation} />}
                    <ProfilePanel config={parsed.config} onPatch={handlePatch} />
                  </>
                )}
              </div>
            }
          />
        )}

        {/* The team baseline: read-only, formatted or raw */}
        {showFile && !loading && !fetchError && found && readOnly && diskContent && (
          <>
            {parsed.parseError && (
              <ErrorNotice title="Couldn't parse harness.yaml" details={parsed.parseError} />
            )}

            {view === "formatted" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "20px", paddingTop: "4px" }}>
                {validation && <ValidationBanner result={validation} />}
                <ProfilePanel config={parsed.config} />
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

      {share.config && (
        <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} config={share.config} />
      )}
    </div>
  );
}
