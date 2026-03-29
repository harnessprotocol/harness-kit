import { Suspense, lazy } from "react";
import { useFileEditor } from "../../hooks/useFileEditor";
import EditorToolbar from "../../components/file-explorer/EditorToolbar";

const MonacoEditor = lazy(() => import("../../components/plugin-explorer/MonacoEditor"));

const FILE_PATH = "~/.claude/mcp.json";
const VIEW_MODES = [{ key: "editor", label: "Editor" }];

export default function McpServersPage() {
  const editor = useFileEditor(FILE_PATH);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <EditorToolbar
        filePath={FILE_PATH}
        isDirty={editor.isDirty}
        saving={editor.saving}
        viewMode="editor"
        availableModes={VIEW_MODES}
        onViewModeChange={() => {}}
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
        {!editor.loading && !editor.error && editor.content !== null && (
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
