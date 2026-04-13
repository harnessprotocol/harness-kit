import { useEffect, useRef, useState } from "react";
import type { AISessionRow } from "../../lib/tauri";

interface Props {
  sessions: AISessionRow[];
  currentSessionId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  ollamaRunning: boolean;
}

function formatRelativeDate(isoDate: string): string {
  const d = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface ContextMenuState {
  sessionId: string;
  x: number;
  y: number;
}

export function SessionList({
  sessions,
  currentSessionId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  ollamaRunning,
}: Props) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [contextMenu]);

  const handleRightClick = (e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    setContextMenu({ sessionId, x: e.clientX, y: e.clientY });
  };

  const startRename = (id: string) => {
    const s = sessions.find((s) => s.id === id);
    setRenameValue(s?.title ?? "");
    setRenamingId(id);
    setContextMenu(null);
  };

  const commitRename = (id: string) => {
    const title = renameValue.trim();
    if (title) onRename(id, title);
    setRenamingId(null);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        borderRight: "1px solid var(--separator)",
        background: "var(--bg-sidebar)",
        minWidth: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 10px 8px",
          borderBottom: "1px solid var(--separator)",
          flexShrink: 0,
        }}
      >
        <button
          onClick={onNew}
          disabled={!ollamaRunning}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            width: "100%",
            padding: "6px 10px",
            background: ollamaRunning ? "var(--accent)" : "var(--bg-surface)",
            color: ollamaRunning ? "#fff" : "var(--fg-subtle)",
            border: "none",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: ollamaRunning ? "pointer" : "not-allowed",
            transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => {
            if (ollamaRunning) (e.currentTarget as HTMLElement).style.opacity = "0.85";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.opacity = "1";
          }}
          title={ollamaRunning ? "New chat (⌘N)" : "Ollama is not running"}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Chat
        </button>
      </div>

      {/* Session list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {sessions.length === 0 ? (
          <div
            style={{
              padding: "20px 12px",
              textAlign: "center",
              fontSize: 12,
              color: "var(--fg-subtle)",
            }}
          >
            No sessions yet
          </div>
        ) : (
          sessions.map((session) => {
            const isActive = session.id === currentSessionId;
            return (
              <div
                key={session.id}
                className={`row-list-item${isActive ? " selected" : ""}`}
                style={{
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 2,
                  cursor: "pointer",
                  padding: "8px 12px",
                }}
                onClick={() => onSelect(session.id)}
                onContextMenu={(e) => handleRightClick(e, session.id)}
              >
                {renamingId === session.id ? (
                  <input
                    ref={renameInputRef}
                    className="form-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(session.id);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onBlur={() => commitRename(session.id)}
                    style={{ fontSize: 12, width: "100%" }}
                  />
                ) : (
                  <>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: isActive ? "var(--accent-text, var(--fg-base))" : "var(--fg-base)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        width: "100%",
                      }}
                    >
                      {session.title || "Untitled"}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {session.model && (
                        <span
                          style={{
                            fontSize: 10,
                            padding: "0 5px",
                            background: "var(--bg-surface)",
                            border: "1px solid var(--border-subtle)",
                            borderRadius: 3,
                            color: "var(--fg-muted)",
                            maxWidth: 100,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {session.model}
                        </span>
                      )}
                      <span style={{ fontSize: 10, color: "var(--fg-subtle)" }}>
                        {formatRelativeDate(session.updatedAt)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 7,
            padding: "4px 0",
            zIndex: 200,
            minWidth: 140,
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
          }}
        >
          {[
            {
              label: "Rename",
              action: () => startRename(contextMenu.sessionId),
            },
            {
              label: "Delete",
              action: () => {
                onDelete(contextMenu.sessionId);
                setContextMenu(null);
              },
              danger: true,
            },
          ].map((item) => (
            <button
              key={item.label}
              onClick={item.action}
              style={{
                display: "block",
                width: "100%",
                padding: "6px 14px",
                background: "none",
                border: "none",
                textAlign: "left",
                fontSize: 12,
                color: item.danger ? "var(--danger, #ef4444)" : "var(--fg-base)",
                cursor: "pointer",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--hover-bg)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "none";
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
