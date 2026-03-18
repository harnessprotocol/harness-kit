import { useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { FileTreeNode } from "@harness-kit/shared";
import FileTypeIcon from "./FileTypeIcon";

interface FileTreeProps {
  node: FileTreeNode;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  depth?: number;
  defaultExpanded?: boolean;
}

function FileTreeItem({ node, selectedPath, onSelectFile, depth = 0, defaultExpanded = false }: FileTreeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded || depth < 1);
  const isDir = node.kind === "directory";
  const isSelected = node.path === selectedPath;

  const handleClick = useCallback(() => {
    if (isDir) {
      setExpanded((prev) => !prev);
    } else {
      onSelectFile(node.path);
    }
  }, [isDir, node.path, onSelectFile]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleClick();
    } else if (isDir && e.key === "ArrowRight" && !expanded) {
      setExpanded(true);
    } else if (isDir && e.key === "ArrowLeft" && expanded) {
      setExpanded(false);
    }
  }, [handleClick, isDir, expanded]);

  return (
    <div>
      <div
        role="treeitem"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        aria-expanded={isDir ? expanded : undefined}
        aria-selected={isSelected}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          padding: "3px 8px",
          paddingLeft: `${8 + depth * 16}px`,
          fontSize: "12px",
          color: "var(--fg-base)",
          cursor: "pointer",
          borderRadius: "4px",
          background: isSelected ? "rgba(91,80,232,0.1)" : "transparent",
          position: "relative",
        }}
        onMouseEnter={(e) => {
          if (!isSelected) e.currentTarget.style.background = "var(--hover-bg)";
        }}
        onMouseLeave={(e) => {
          if (!isSelected) e.currentTarget.style.background = "transparent";
        }}
      >
        {/* Vertical guide lines */}
        {depth > 0 && Array.from({ length: depth }).map((_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${14 + i * 16}px`,
              top: 0,
              bottom: 0,
              width: "1px",
              background: "var(--border-subtle)",
            }}
          />
        ))}

        {/* Expand/collapse chevron for dirs */}
        {isDir ? (
          <svg width="10" height="10" viewBox="0 0 10 10" style={{
            flexShrink: 0,
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.1s",
            color: "var(--fg-subtle)",
          }}>
            <path d="M3 1.5l4 3.5-4 3.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        ) : (
          <span style={{ width: 10, flexShrink: 0 }} />
        )}

        <FileTypeIcon name={node.name} kind={node.kind} expanded={expanded} />
        <span style={{
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          fontWeight: isDir ? 500 : 400,
        }}>
          {node.name}
        </span>
      </div>

      {/* Children */}
      <AnimatePresence>
        {isDir && expanded && node.children && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            style={{ overflow: "hidden" }}
            role="group"
          >
            {node.children.map((child) => (
              <FileTreeItem
                key={child.path}
                node={child}
                selectedPath={selectedPath}
                onSelectFile={onSelectFile}
                depth={depth + 1}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface FileTreeRootProps {
  tree: FileTreeNode;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}

export default function FileTree({ tree, selectedPath, onSelectFile }: FileTreeRootProps) {
  return (
    <div role="tree" style={{
      overflowY: "auto", overflowX: "hidden",
      flex: 1, padding: "4px 0",
    }}>
      <FileTreeItem
        node={tree}
        selectedPath={selectedPath}
        onSelectFile={onSelectFile}
        defaultExpanded
      />
    </div>
  );
}
