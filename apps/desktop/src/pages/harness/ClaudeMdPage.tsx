import { useState } from "react";
import EditorPane from "../../components/file-explorer/EditorPane";
import { useFileEditor } from "../../hooks/useFileEditor";
import { getAvailableViewModes, getDefaultViewMode } from "../../lib/viewModes";

const FILE_PATH = "~/.claude/CLAUDE.md";

export default function ClaudeMdPage() {
  const editor = useFileEditor(FILE_PATH);
  const [viewMode, setViewMode] = useState(getDefaultViewMode(FILE_PATH));
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <EditorPane
        filePath={FILE_PATH}
        editor={editor}
        viewMode={viewMode}
        availableModes={getAvailableViewModes(FILE_PATH)}
        onViewModeChange={setViewMode}
      />
    </div>
  );
}
