import { useCallback, useEffect, useState } from "react";
import { useClaudeFileList } from "../../hooks/useClaudeFileList";
import { useFileEditor } from "../../hooks/useFileEditor";
import { getAvailableViewModes, getDefaultViewMode } from "../../lib/viewModes";
import SplitPane from "../../components/file-explorer/SplitPane";
import ClaudeFileListPanel from "../../components/file-explorer/ClaudeFileListPanel";
import EditorPane from "../../components/file-explorer/EditorPane";

export default function SettingsPage() {
  const fileList = useClaudeFileList();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState("editor");

  const filePath = selectedFile ? `~/.claude/${selectedFile}` : null;
  const editor = useFileEditor(filePath);

  // Auto-select first file on initial load
  useEffect(() => {
    if (!fileList.loading && fileList.files.length > 0 && selectedFile === null) {
      const first = fileList.files[0];
      setSelectedFile(first);
      setViewMode(getDefaultViewMode(`~/.claude/${first}`));
    }
  }, [fileList.loading, fileList.files, selectedFile]);

  const handleSelectFile = useCallback((name: string) => {
    setSelectedFile(name);
    setViewMode(getDefaultViewMode(`~/.claude/${name}`));
  }, []);

  const availableModes = getAvailableViewModes(filePath);

  return (
    <SplitPane
      left={
        <ClaudeFileListPanel
          files={fileList.files}
          loading={fileList.loading}
          error={fileList.error}
          selectedFile={selectedFile}
          onSelectFile={handleSelectFile}
          isDirty={editor.isDirty}
        />
      }
      right={
        <EditorPane
          filePath={filePath}
          editor={editor}
          viewMode={viewMode}
          availableModes={availableModes}
          onViewModeChange={setViewMode}
        />
      }
      collapsed={collapsed}
      onToggleCollapsed={() => setCollapsed((c) => !c)}
    />
  );
}
