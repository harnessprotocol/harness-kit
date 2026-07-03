import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toggleTheme } from "../lib/theme";

interface NavLike {
  id: string;
  label: string;
  path: string;
  children?: { label: string; path: string }[];
}

interface Command {
  id: string;
  label: string;
  group: string;
  hint?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  sections: NavLike[];
}

/**
 * VS-Code-style command palette. Navigate anywhere and run a few actions.
 */
export function CommandPalette({ open, onClose, sections }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => {
      navigate(path);
      onClose();
    };
    const list: Command[] = [];
    list.push({ id: "toggle-theme", label: "Toggle light / dark theme", group: "Actions", run: () => { toggleTheme(); onClose(); } });
    for (const s of sections) {
      list.push({ id: `nav-${s.id}`, label: `Go to ${s.label}`, group: "Navigate", run: go(s.path) });
      for (const c of s.children ?? []) {
        list.push({ id: `nav-${s.id}-${c.path}`, label: `${s.label}: ${c.label}`, group: "Navigate", run: go(c.path) });
      }
    }
    return list;
  }, [sections, navigate, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      // focus after paint
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  if (!open) return null;

  function onKeyDown(e: ReactKeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[selected]?.run();
    }
  }

  let lastGroup = "";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "12vh",
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        style={{
          width: "min(560px, 92vw)",
          maxHeight: "60vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg-elevated)",
          borderRadius: "12px",
          boxShadow: "var(--shadow-popover)",
          overflow: "hidden",
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a command or search…"
          aria-label="Command palette search"
          style={{
            border: "none",
            outline: "none",
            background: "transparent",
            color: "var(--fg-base)",
            fontSize: "15px",
            padding: "15px 18px",
          }}
        />
        <div style={{ height: "1px", background: "var(--separator)" }} />
        <div style={{ overflowY: "auto", padding: "6px" }}>
          {filtered.length === 0 && (
            <div style={{ padding: "20px", textAlign: "center", color: "var(--fg-subtle)", fontSize: "13px" }}>
              No matching commands
            </div>
          )}
          {filtered.map((cmd, i) => {
            const showGroup = cmd.group !== lastGroup;
            lastGroup = cmd.group;
            const isSel = i === selected;
            return (
              <div key={cmd.id}>
                {showGroup && (
                  <div
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      letterSpacing: "0.07em",
                      textTransform: "uppercase",
                      color: "var(--fg-subtle)",
                      padding: "10px 10px 4px",
                    }}
                  >
                    {cmd.group}
                  </div>
                )}
                <button
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => cmd.run()}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px",
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    cursor: "pointer",
                    borderRadius: "7px",
                    padding: "8px 10px",
                    fontSize: "13px",
                    background: isSel ? "var(--accent-light)" : "transparent",
                    color: isSel ? "var(--accent-text)" : "var(--fg-base)",
                  }}
                >
                  <span>{cmd.label}</span>
                  {cmd.hint && (
                    <span style={{ fontSize: "11px", color: "var(--fg-subtle)" }}>{cmd.hint}</span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
