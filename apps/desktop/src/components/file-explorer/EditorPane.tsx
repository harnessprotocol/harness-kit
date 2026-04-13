import { lazy, Suspense } from "react";
import type { FileEditorState } from "../../hooks/useFileEditor";
import EditorToolbar from "./EditorToolbar";

const MonacoEditor = lazy(() => import("../plugin-explorer/MonacoEditor"));
const MarkdownPanel = lazy(() => import("../MarkdownPanel"));

// ── Shimmer skeleton (loading state) ─────────────────────────

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

// ── Props ─────────────────────────────────────────────────────

export interface EditorPaneProps {
  filePath: string | null;
  editor: FileEditorState;
  viewMode: string;
  availableModes: Array<{ key: string; label: string }>;
  onViewModeChange: (mode: string) => void;
  /** Rendered when viewMode === "formatted" (harness.yaml structured view) */
  formattedContent?: React.ReactNode;
  /** Extra toolbar buttons (export menu, version history, etc.) */
  toolbarActions?: React.ReactNode;
  /** Smaller text below filename in toolbar */
  toolbarSubtitle?: string;
}

// ── Component ─────────────────────────────────────────────────

export default function EditorPane({
  filePath,
  editor,
  viewMode,
  availableModes,
  onViewModeChange,
  formattedContent,
  toolbarActions,
  toolbarSubtitle,
}: EditorPaneProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <EditorToolbar
        filePath={filePath}
        isDirty={editor.isDirty}
        saving={editor.saving}
        viewMode={viewMode}
        availableModes={availableModes}
        onViewModeChange={onViewModeChange}
        onSave={filePath ? editor.saveFile : undefined}
        actions={toolbarActions}
        subtitle={toolbarSubtitle}
      />

      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {/* Empty state */}
        {!filePath && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              height: "100%",
              color: "var(--fg-subtle)",
              fontSize: "12px",
            }}
          >
            Select a file to view
          </div>
        )}

        {/* Loading */}
        {filePath && editor.loading && <ShimmerSkeleton />}

        {/* Error */}
        {filePath && editor.error && (
          <div style={{ padding: "20px 24px" }}>
            <div style={{ fontSize: "13px", color: "var(--danger)", marginBottom: "8px" }}>
              {editor.error}
            </div>
            <button
              onClick={editor.reload}
              style={{
                fontSize: "12px",
                color: "var(--accent-text)",
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Reload
            </button>
          </div>
        )}

        {/* Content views */}
        {filePath && !editor.loading && !editor.error && editor.content !== null && (
          <>
            {viewMode === "editor" && (
              <Suspense fallback={<ShimmerSkeleton />}>
                <MonacoEditor
                  filePath={filePath}
                  content={editor.content}
                  onChange={editor.updateContent}
                  onSave={editor.saveFile}
                />
              </Suspense>
            )}

            {(viewMode === "preview" || (viewMode === "formatted" && !formattedContent)) && (
              <Suspense fallback={<ShimmerSkeleton />}>
                <div style={{ flex: 1, overflow: "auto", padding: "0 4px", height: "100%" }}>
                  <MarkdownPanel content={editor.content} defaultView="preview" fill />
                </div>
              </Suspense>
            )}

            {viewMode === "split" && (
              <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
                {/* Left: editor */}
                <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
                  <Suspense fallback={<ShimmerSkeleton />}>
                    <MonacoEditor
                      filePath={filePath}
                      content={editor.content}
                      onChange={editor.updateContent}
                      onSave={editor.saveFile}
                    />
                  </Suspense>
                </div>
                {/* Divider */}
                <div
                  style={{
                    width: "1px",
                    flexShrink: 0,
                    background: "var(--border-base)",
                  }}
                />
                {/* Right: live preview */}
                <div style={{ flex: 1, minWidth: 0, overflow: "auto", padding: "0 4px" }}>
                  <Suspense fallback={<ShimmerSkeleton />}>
                    <MarkdownPanel content={editor.content} defaultView="preview" fill />
                  </Suspense>
                </div>
              </div>
            )}

            {viewMode === "raw" && (
              <div
                style={{
                  height: "100%",
                  overflow: "auto",
                  padding: "14px 16px",
                }}
              >
                <pre
                  style={{
                    margin: 0,
                    fontFamily: "ui-monospace, monospace",
                    fontSize: "11px",
                    lineHeight: "1.6",
                    color: "var(--fg-muted)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {editor.content}
                </pre>
              </div>
            )}

            {viewMode === "formatted" && formattedContent}
          </>
        )}
      </div>
    </div>
  );
}
