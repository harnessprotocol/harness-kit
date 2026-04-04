interface EditorToolbarProps {
  filePath: string | null;
  isDirty?: boolean;
  saving?: boolean;
  viewMode: string;
  availableModes: Array<{ key: string; label: string }>;
  onViewModeChange: (mode: string) => void;
  onSave?: () => void;
  /** Extra controls rendered after the save button (e.g. export menu, version history) */
  actions?: React.ReactNode;
  /** Smaller muted text below the filename (e.g. full file path) */
  subtitle?: string;
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

export default function EditorToolbar({
  filePath,
  isDirty = false,
  saving = false,
  viewMode,
  availableModes,
  onViewModeChange,
  onSave,
  actions,
  subtitle,
}: EditorToolbarProps) {
  return (
    <div
      style={{
        padding: "6px 12px 6px 36px", // 36px left to clear the collapse toggle button
        borderBottom: "1px solid var(--border-base)",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        flexShrink: 0,
        background: "var(--bg-base)",
        minHeight: "36px",
      }}
    >
      {/* Filename + dirty indicator + subtitle */}
      {filePath && (
        <div style={{ overflow: "hidden", minWidth: 0 }}>
          <span style={{
            fontSize: "12px",
            color: "var(--fg-base)",
            fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            display: "block",
          }}>
            {basename(filePath)}
            {isDirty && (
              <span style={{ color: "var(--warning)", marginLeft: "4px" }} title="Unsaved changes">●</span>
            )}
          </span>
          {subtitle && (
            <span style={{
              fontSize: "10px",
              color: "var(--fg-subtle)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              display: "block",
            }}>
              {subtitle}
            </span>
          )}
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* View mode toggle */}
      {availableModes.length > 1 && (
        <div style={{
          display: "flex",
          gap: "1px",
          background: "var(--bg-elevated)",
          borderRadius: "5px",
          padding: "2px",
        }}>
          {availableModes.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onViewModeChange(key)}
              style={{
                fontSize: "11px",
                fontWeight: viewMode === key ? 600 : 400,
                padding: "3px 8px",
                borderRadius: "4px",
                border: "none",
                background: viewMode === key ? "var(--bg-surface)" : "transparent",
                color: viewMode === key ? "var(--fg-base)" : "var(--fg-subtle)",
                cursor: "pointer",
                boxShadow: viewMode === key ? "var(--shadow-sm)" : "none",
                fontFamily: "inherit",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Save button (only shown when dirty) */}
      {onSave && isDirty && (
        <button
          onClick={onSave}
          disabled={saving}
          style={{
            fontSize: "11px",
            fontWeight: 500,
            padding: "3px 10px",
            borderRadius: "5px",
            border: "none",
            background: "var(--accent)",
            color: "#fff",
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.6 : 1,
            fontFamily: "inherit",
          }}
        >
          {saving ? "Saving\u2026" : "Save"}
        </button>
      )}

      {/* Extra actions slot */}
      {actions}
    </div>
  );
}
