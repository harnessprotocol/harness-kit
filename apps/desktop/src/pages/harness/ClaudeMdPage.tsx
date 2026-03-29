import { Suspense, lazy, useState } from "react";
import { useFileEditor } from "../../hooks/useFileEditor";
import EditorToolbar from "../../components/file-explorer/EditorToolbar";

const MonacoEditor = lazy(() => import("../../components/plugin-explorer/MonacoEditor"));
const MarkdownPanel = lazy(() => import("../../components/MarkdownPanel"));

const FILE_PATH = "~/.claude/CLAUDE.md";
const VIEW_MODES = [
  { key: "preview", label: "Preview" },
  { key: "editor", label: "Editor" },
];

export default function ClaudeMdPage() {
  const [viewMode, setViewMode] = useState("preview");
  const editor = useFileEditor(FILE_PATH);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <EditorToolbar
        filePath={FILE_PATH}
        isDirty={editor.isDirty}
        saving={editor.saving}
        viewMode={viewMode}
        availableModes={VIEW_MODES}
        onViewModeChange={setViewMode}
        onSave={editor.saveFile}
      />
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {editor.loading && (
          <p style={{ padding: "20px 24px", fontSize: "13px", color: "var(--fg-subtle)" }}>
            Loading…
          </p>
        )}
        {editor.error && (
          <p style={{ padding: "20px 24px", fontSize: "13px", color: "var(--danger)" }}>
            {editor.error}
          </p>
        )}
        {!editor.loading && !editor.error && editor.content !== null && viewMode === "preview" && (
          <Suspense fallback={null}>
            <MarkdownPanel content={editor.content} defaultView="preview" fill />
          </Suspense>
        )}
        {!editor.loading && !editor.error && editor.content !== null && viewMode === "editor" && (
          <Suspense fallback={null}>
            <MonacoEditor
              filePath={FILE_PATH}
              content={editor.content}
              onChange={editor.updateContent}
              onSave={editor.saveFile}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
