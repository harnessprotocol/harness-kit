import { AnimatePresence, motion } from "framer-motion";
import { lazy, Suspense, useState } from "react";
import MarkdownPanel from "../MarkdownPanel";

const MonacoEditor = lazy(() => import("./MonacoEditor"));

interface FileViewerProps {
  filePath: string | null;
  content: string | null;
  loading: boolean;
  onChange: (content: string) => void;
  onSave: () => void;
}

function isMarkdown(path: string): boolean {
  return path.endsWith(".md") || path.endsWith(".mdx");
}

function ShimmerSkeleton() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        padding: "16px",
        flex: 1,
      }}
    >
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          style={{
            height: "14px",
            borderRadius: "4px",
            background: "var(--bg-elevated)",
            width: `${60 + ((i * 17) % 35)}%`,
            animation: "shimmer 1.5s ease-in-out infinite",
            animationDelay: `${i * 0.05}s`,
            opacity: 0.5,
          }}
        />
      ))}
    </div>
  );
}

export default function FileViewer({
  filePath,
  content,
  loading,
  onChange,
  onSave,
}: FileViewerProps) {
  const [mdView, setMdView] = useState<"editor" | "preview">("editor");

  if (!filePath) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
          color: "var(--fg-subtle)",
          fontSize: "12px",
        }}
      >
        Select a file to view
      </div>
    );
  }

  if (loading) {
    return <ShimmerSkeleton />;
  }

  if (content === null) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
          color: "var(--fg-subtle)",
          fontSize: "12px",
        }}
      >
        Unable to load file
      </div>
    );
  }

  const isMd = isMarkdown(filePath);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* Markdown tab toggle */}
      {isMd && (
        <div
          style={{
            display: "flex",
            gap: "2px",
            padding: "6px 12px",
            borderBottom: "1px solid var(--border-subtle)",
            flexShrink: 0,
          }}
        >
          {(["editor", "preview"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setMdView(tab)}
              style={{
                fontSize: "10px",
                fontWeight: mdView === tab ? 600 : 400,
                padding: "3px 8px",
                borderRadius: "4px",
                border: "none",
                background: mdView === tab ? "var(--bg-elevated)" : "transparent",
                color: mdView === tab ? "var(--fg-base)" : "var(--fg-subtle)",
                cursor: "pointer",
                boxShadow: mdView === tab ? "var(--shadow-sm)" : "none",
              }}
            >
              {tab === "editor" ? "Editor" : "Preview"}
            </button>
          ))}
        </div>
      )}

      {/* File content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={filePath + (isMd ? mdView : "")}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
          style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
        >
          {isMd && mdView === "preview" ? (
            <div style={{ flex: 1, overflow: "auto", padding: "0 4px" }}>
              <MarkdownPanel content={content} fill />
            </div>
          ) : (
            <Suspense fallback={<ShimmerSkeleton />}>
              <MonacoEditor
                filePath={filePath}
                content={content}
                onChange={onChange}
                onSave={onSave}
              />
            </Suspense>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
