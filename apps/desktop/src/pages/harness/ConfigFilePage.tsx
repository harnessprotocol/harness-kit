import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useFileEditor } from "../../hooks/useFileEditor";
import { getAvailableViewModes, getDefaultViewMode } from "../../lib/viewModes";
import EditorPane from "../../components/file-explorer/EditorPane";

export default function ConfigFilePage() {
  const { filename } = useParams<{ filename: string }>();
  // Decode and validate: reject any name containing path separators or traversal sequences
  const decoded = filename ? decodeURIComponent(filename) : null;
  const safeName = decoded && !decoded.includes("/") && !decoded.includes("\\") && !decoded.includes("..") ? decoded : null;
  const filePath = safeName ? `~/.claude/${safeName}` : null;
  const editor = useFileEditor(filePath);
  const [viewMode, setViewMode] = useState(() => getDefaultViewMode(filePath));

  useEffect(() => {
    setViewMode(getDefaultViewMode(filePath));
  }, [filePath]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <EditorPane
        filePath={filePath}
        editor={editor}
        viewMode={viewMode}
        availableModes={getAvailableViewModes(filePath)}
        onViewModeChange={setViewMode}
      />
    </div>
  );
}
