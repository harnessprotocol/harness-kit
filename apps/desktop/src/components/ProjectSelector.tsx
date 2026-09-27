import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Folder, FolderOpen, X } from "lucide-react";
import {
  chooseProjectDir,
  projectDirLabel,
  useProjectDir,
  useRecentProjectDirs,
} from "../lib/project-dir";
import "./ProjectSelector.css";

const MAX_RECENT_SHOWN = 5;

/**
 * The title bar's project selector (spec AC-17, design D9): the one place a
 * project directory is chosen. Machine, Drift and Profile › Compile read what
 * it writes through lib/project-dir.ts. A project restored at launch is not
 * granted here: each reader grants the directory before it reads it.
 *
 * A menu button: Enter/Space/ArrowDown open it on the first item, ArrowUp on
 * the last; arrows move, Home/End jump; Escape closes and returns focus to the
 * button; Tab or a click outside closes it.
 *
 * The whole control carries `data-no-drag`, which the title bar's mousedown
 * handler skips, so pressing it never starts a window drag.
 */
export function ProjectSelector() {
  const [dir, setDir] = useProjectDir();
  const recent = useRecentProjectDirs()
    .filter((path) => path !== dir)
    .slice(0, MAX_RECENT_SHOWN);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<"first" | "last">("first");
  const menuId = useId();

  function items(): HTMLElement[] {
    return Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  }

  useEffect(() => {
    if (!open) return;
    const list = items();
    (pendingFocus.current === "last" ? list[list.length - 1] : list[0])?.focus();
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function openMenu(focus: "first" | "last") {
    pendingFocus.current = focus;
    setOpen(true);
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  function onButtonKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(event.key === "ArrowUp" ? "last" : "first");
    }
  }

  function onMenuKeyDown(event: React.KeyboardEvent) {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    if (event.key === "ArrowDown") next = (index + 1) % list.length;
    else if (event.key === "ArrowUp") next = (index - 1 + list.length) % list.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = list.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    } else if (event.key === "Tab") {
      close(false);
      return;
    }
    if (next !== null) {
      event.preventDefault();
      list[next]?.focus();
    }
  }

  async function choose() {
    close(true);
    await chooseProjectDir();
  }

  function pick(path: string | null) {
    setDir(path);
    close(true);
  }

  const label = dir ? projectDirLabel(dir) : "No project";

  return (
    <div className="hk-project-selector" ref={rootRef} data-no-drag="">
      <button
        ref={buttonRef}
        type="button"
        className="hk-project-selector-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={dir ? `Project: ${label}` : "Project: none"}
        title={dir ?? "No project directory. Machine scans this machine only."}
        data-empty={dir ? undefined : ""}
        onClick={() => (open ? close(false) : openMenu("first"))}
        onKeyDown={onButtonKeyDown}
      >
        <Folder size={13} strokeWidth={1.7} aria-hidden="true" />
        <span className="hk-project-selector-label">{label}</span>
        <ChevronDown size={11} strokeWidth={1.7} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Project directory"
          className="hk-project-selector-menu"
          onKeyDown={onMenuKeyDown}
        >
          <button type="button" role="menuitem" tabIndex={-1} className="hk-project-selector-item" onClick={choose}>
            <FolderOpen size={13} strokeWidth={1.7} aria-hidden="true" />
            Choose folder…
          </button>

          {recent.length > 0 && (
            <div role="group" aria-label="Recent projects" className="hk-project-selector-group">
              <div className="hk-project-selector-heading" aria-hidden="true">
                Recent
              </div>
              {recent.map((path) => (
                <button
                  key={path}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  className="hk-project-selector-item"
                  title={path}
                  aria-label={`${projectDirLabel(path)}, ${path}`}
                  onClick={() => pick(path)}
                >
                  <Folder size={13} strokeWidth={1.7} aria-hidden="true" />
                  <span className="hk-project-selector-item-text">
                    <span className="hk-project-selector-item-name">{projectDirLabel(path)}</span>
                    <span className="hk-project-selector-item-path">{path}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {dir && (
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="hk-project-selector-item"
              onClick={() => pick(null)}
            >
              <X size={13} strokeWidth={1.7} aria-hidden="true" />
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
