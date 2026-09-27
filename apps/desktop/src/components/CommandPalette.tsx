import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toggleTheme } from "../lib/theme";
import { useCommands } from "../lib/commands";
import { SETTINGS, type NavEntry } from "../nav";

interface Command {
  id: string;
  label: string;
  group: string;
  hint?: string;
  /** Lower-cased text the search matches: the label plus a page command's group and keywords. */
  search: string;
  disabled?: boolean;
  run: () => void;
}

/** The section registered page commands appear under, ahead of everything else. */
export const PAGE_GROUP = "This page";

function reportFailure(error: unknown) {
  console.error("[command palette] command failed:", error);
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  sections: NavEntry[];
}

/**
 * VS-Code-style command palette (spec AC-21). Lists, in order: the actions the
 * open page registered through lib/commands.ts ("This page"), the app-wide
 * actions, and navigation derived from nav.ts. A page command with the id of
 * an app-wide one replaces it while that page is open. A disabled page
 * command is listed but does not run, like the button it mirrors.
 */
export function CommandPalette({ open, onClose, sections }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  // The highlighted command, by id, so it stays put when the list around it
  // changes (a page registering commands while the palette is open). null,
  // or an id no longer listed, highlights the first command.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const registered = useCommands();

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => {
      navigate(path);
      onClose();
    };
    const builtIn = (id: string, label: string, group: string, run: () => void): Command => ({
      id,
      label,
      group,
      search: label.toLowerCase(),
      run,
    });
    const list: Command[] = registered.map((command) => ({
      id: command.id,
      label: command.title,
      group: PAGE_GROUP,
      hint: command.shortcut,
      search: [command.title, command.group ?? "", ...(command.keywords ?? [])].join(" ").toLowerCase(),
      disabled: command.disabled,
      run: () => {
        // Ask to close before running, so a command that throws still closes
        // the palette. onClose only queues the state update; focus is settled
        // when the palette actually closes (see the effect on `open`).
        onClose();
        try {
          const result = command.run();
          if (result instanceof Promise) result.catch(reportFailure);
        } catch (error) {
          reportFailure(error);
        }
      },
    }));
    const pageIds = new Set(registered.map((command) => command.id));
    const rest: Command[] = [];
    rest.push(builtIn("toggle-theme", "Toggle light / dark theme", "Actions", () => { toggleTheme(); onClose(); }));
    rest.push(builtIn("nav-settings", "Go to Settings", "Navigate", go(SETTINGS.path)));
    rest.push(builtIn("open-drift", "Open Drift vs harness.yaml", "Navigate", go("/machine?view=drift")));
    for (const s of sections) {
      rest.push(builtIn(`nav-${s.id}`, `Go to ${s.label}`, "Navigate", go(s.path)));
      for (const c of s.children ?? []) {
        rest.push(builtIn(`nav-${s.id}-${c.path}`, `${s.label}: ${c.label}`, "Navigate", go(c.path)));
      }
    }
    return [...list, ...rest.filter((command) => !pageIds.has(command.id))];
  }, [registered, sections, navigate, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.search.includes(q));
  }, [commands, query]);

  const found = filtered.findIndex((command) => command.id === selectedId);
  const selected = found === -1 ? 0 : found;

  useEffect(() => {
    if (!open) return;
    // Focus returns here on close, e.g. to the title bar's ⌘K button.
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    setQuery("");
    setSelectedId(null);
    // focus after paint
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      // Only if focus was left on the palette (now gone, so on <body>): a
      // command that moved focus elsewhere, a filter or a field, keeps it.
      const active = document.activeElement;
      const leftOnPalette = !active || active === document.body || (dialog?.contains(active) ?? false);
      if (leftOnPalette && returnTo?.isConnected) returnTo.focus();
    };
  }, [open]);

  if (!open) return null;

  function onKeyDown(e: ReactKeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = filtered[Math.min(selected + 1, filtered.length - 1)];
      if (next) setSelectedId(next.id);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const previous = filtered[Math.max(selected - 1, 0)];
      if (previous) setSelectedId(previous.id);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const command = filtered[selected];
      if (command && !command.disabled) command.run();
    }
  }

  let lastGroup = "";

  return (
    <div
      ref={dialogRef}
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
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedId(null);
          }}
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
                  type="button"
                  aria-disabled={cmd.disabled ? "true" : undefined}
                  onMouseEnter={() => setSelectedId(cmd.id)}
                  onClick={() => {
                    if (!cmd.disabled) cmd.run();
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px",
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    cursor: cmd.disabled ? "default" : "pointer",
                    borderRadius: "7px",
                    padding: "8px 10px",
                    fontSize: "13px",
                    background: isSel ? "var(--accent-light)" : "transparent",
                    color: cmd.disabled ? "var(--fg-subtle)" : isSel ? "var(--accent-text)" : "var(--fg-base)",
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
