import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

export interface Command {
  id: string;
  label: string;
  group: string;
  hint?: string;
  run: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  /**
   * The full command list. Consumers own the registry (DESIGN.md §4: "adding
   * a page auto-registers its command — no hardcoded palette list") — this
   * component only renders + filters + navigates the list it's given.
   */
  commands: Command[];
  placeholder?: string;
}

/**
 * VS-Code-style command palette — the app's Cmd+K surface. Framework-agnostic:
 * the command registry (what commands exist, what running one does) lives
 * with the consumer; this component is purely the input/list/keyboard-nav
 * chrome.
 */
export function CommandPalette({ open, onClose, commands, placeholder = "Type a command or search…" }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  if (!open) return null;

  function runSelected(cmd: Command | undefined) {
    if (!cmd) return;
    cmd.run();
  }

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
      runSelected(filtered[selected]);
      onClose();
    }
  }

  let lastGroup = "";

  return (
    <div role="presentation" onMouseDown={onClose} className="hk-command-overlay">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        className="hk-command"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          aria-label="Command palette search"
          className="hk-command-input"
        />
        <div className="hk-command-divider" />
        <div className="hk-command-list">
          {filtered.length === 0 && <div className="hk-command-empty">No matching commands</div>}
          {filtered.map((cmd, i) => {
            const showGroup = cmd.group !== lastGroup;
            lastGroup = cmd.group;
            const isSel = i === selected;
            return (
              <div key={cmd.id}>
                {showGroup && <div className="hk-command-group-label">{cmd.group}</div>}
                <button
                  type="button"
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => {
                    runSelected(cmd);
                    onClose();
                  }}
                  data-selected={isSel ? "true" : undefined}
                  className="hk-command-item"
                >
                  <span>{cmd.label}</span>
                  {cmd.hint && <span className="hk-command-item-hint">{cmd.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
