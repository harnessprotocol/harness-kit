import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listClaudeDir } from "../../lib/tauri";
import { useFileEditor } from "../../hooks/useFileEditor";
import SplitPane from "../../components/file-explorer/SplitPane";
import EditorToolbar from "../../components/file-explorer/EditorToolbar";
import {
  getConfigFilesDetailLevel,
  type ConfigFilesDetailLevel,
} from "../../lib/preferences";

const MonacoEditor = lazy(() => import("../../components/plugin-explorer/MonacoEditor"));

// ── File filtering ────────────────────────────────────────────

const TEXT_EXTENSIONS = new Set([".md", ".json", ".yaml", ".yml", ".sh", ".txt", ".toml", ".mjs"]);
const HIDDEN_PATTERNS: RegExp[] = [
  /^security_warnings_state_/,
  /^statsig-/,
  /^stats-cache\.json$/,
];
const ESSENTIALS = new Set(["CLAUDE.md", "AGENT.md", "SOUL.md", "settings.json", "keybindings.json"]);

function extOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx);
}

function filterFiles(files: string[], level: ConfigFilesDetailLevel): string[] {
  if (level === "essentials") return files.filter((f) => ESSENTIALS.has(f));
  if (level === "text-files") return files.filter(
    (f) => TEXT_EXTENSIONS.has(extOf(f)) && !HIDDEN_PATTERNS.some((p) => p.test(f))
  );
  return files;
}

// ── Component ─────────────────────────────────────────────────

export default function SettingsPage() {
  const navigate = useNavigate();
  const detailLevel = getConfigFilesDetailLevel();

  const [allFiles, setAllFiles] = useState<string[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [pendingFile, setPendingFile] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState("editor");

  const files = filterFiles(allFiles, detailLevel);
  const filePath = selectedFile ? `~/.claude/${selectedFile}` : null;
  const editor = useFileEditor(filePath);

  // Auto-select first file and set view mode on initial load
  useEffect(() => {
    listClaudeDir()
      .then((entries) => {
        setAllFiles(entries);
        const filtered = filterFiles(entries, detailLevel);
        if (filtered.length > 0) {
          setSelectedFile(filtered[0]);
          setViewMode(extOf(filtered[0]) === ".md" ? "preview" : "editor");
        }
      })
      .catch((e) => setListError(String(e)))
      .finally(() => setLoadingList(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectFile = useCallback((name: string) => {
    if (name === selectedFile) return;
    if (editor.isDirty) {
      setPendingFile(name);
    } else {
      setSelectedFile(name);
      setViewMode(extOf(name) === ".md" ? "preview" : "editor");
    }
  }, [selectedFile, editor.isDirty]);

  const handleConfirmDiscard = useCallback(() => {
    if (!pendingFile) return;
    setSelectedFile(pendingFile);
    setViewMode(extOf(pendingFile) === ".md" ? "preview" : "editor");
    setPendingFile(null);
  }, [pendingFile]);

  const viewModes = extOf(selectedFile ?? "") === ".md"
    ? [{ key: "editor", label: "Editor" }, { key: "preview", label: "Preview" }]
    : [{ key: "editor", label: "Editor" }];

  // ── Left panel ───────────────────────────────────────────────
  const leftPanel = (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
      <div style={{
        padding: "10px 12px 6px",
        fontSize: "10px",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: "var(--fg-subtle)",
        flexShrink: 0,
      }}>
        Config Files
      </div>

      {pendingFile && (
        <div style={{
          margin: "0 8px 6px",
          padding: "8px 10px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "6px",
          fontSize: "11px",
          color: "var(--fg-base)",
          flexShrink: 0,
        }}>
          <div style={{ marginBottom: "6px" }}>
            Unsaved changes in{" "}
            <code style={{ fontFamily: "ui-monospace, monospace" }}>{selectedFile}</code>.
            Discard and switch?
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              onClick={handleConfirmDiscard}
              style={{
                fontSize: "11px", padding: "2px 8px", borderRadius: "4px",
                border: "1px solid var(--border-base)",
                background: "var(--danger-light)", color: "var(--danger)", cursor: "pointer",
              }}
            >
              Discard
            </button>
            <button
              onClick={() => setPendingFile(null)}
              style={{
                fontSize: "11px", padding: "2px 8px", borderRadius: "4px",
                border: "1px solid var(--border-base)",
                background: "transparent", color: "var(--fg-muted)", cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflow: "auto" }}>
        {loadingList && (
          <p style={{ fontSize: "12px", color: "var(--fg-subtle)", padding: "8px 12px", margin: 0 }}>
            Loading…
          </p>
        )}
        {listError && (
          <p style={{ fontSize: "12px", color: "var(--danger)", padding: "8px 12px", margin: 0 }}>
            {listError}
          </p>
        )}
        {!loadingList && !listError && files.length === 0 && (
          <div style={{ padding: "8px 12px", fontSize: "12px", color: "var(--fg-subtle)" }}>
            No files found.{" "}
            <button
              onClick={() => navigate("/preferences")}
              style={{
                background: "none", border: "none", padding: 0, cursor: "pointer",
                color: "var(--accent-text)", fontSize: "12px", textDecoration: "underline",
              }}
            >
              Change detail level in Preferences
            </button>
          </div>
        )}
        {files.map((name) => (
          <button
            key={name}
            onClick={() => handleSelectFile(name)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "6px 12px",
              background: selectedFile === name ? "var(--bg-elevated)" : "transparent",
              border: "none",
              borderLeft: selectedFile === name ? "2px solid var(--accent)" : "2px solid transparent",
              cursor: "pointer",
              fontSize: "12px",
              fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
              color: selectedFile === name ? "var(--fg-base)" : "var(--fg-muted)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );

  // ── Right panel ──────────────────────────────────────────────
  const rightPanel = (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <EditorToolbar
        filePath={filePath}
        isDirty={editor.isDirty}
        saving={editor.saving}
        viewMode={viewMode}
        availableModes={viewModes}
        onViewModeChange={setViewMode}
        onSave={filePath ? editor.saveFile : undefined}
      />
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {!selectedFile && (
          <div style={{ padding: "20px 24px", fontSize: "13px", color: "var(--fg-subtle)" }}>
            Select a file to edit
          </div>
        )}
        {selectedFile && editor.loading && (
          <div style={{ padding: "20px 24px", fontSize: "13px", color: "var(--fg-subtle)" }}>
            Loading…
          </div>
        )}
        {selectedFile && editor.error && (
          <div style={{ padding: "20px 24px" }}>
            <div style={{ fontSize: "13px", color: "var(--danger)", marginBottom: "8px" }}>
              {editor.error}
            </div>
            <button
              onClick={() => setSelectedFile((f) => f)}
              style={{
                fontSize: "12px", color: "var(--accent-text)", background: "none",
                border: "none", padding: 0, cursor: "pointer", textDecoration: "underline",
              }}
            >
              Reload
            </button>
          </div>
        )}
        {selectedFile && !editor.loading && !editor.error && editor.content !== null && (
          <Suspense fallback={null}>
            <MonacoEditor
              filePath={`~/.claude/${selectedFile}`}
              content={editor.content}
              onChange={editor.updateContent}
              onSave={editor.saveFile}
            />
          </Suspense>
        )}
      </div>
    </div>
  );

  return (
    <SplitPane
      left={leftPanel}
      right={rightPanel}
      collapsed={collapsed}
      onToggleCollapsed={() => setCollapsed((c) => !c)}
    />
  );
}
