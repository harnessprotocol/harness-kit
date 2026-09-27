import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type DependencyList } from "react";

/**
 * The command registry behind ⌘K (spec AC-21, design D10). Pages register
 * the actions they already expose as buttons; the palette lists whatever is
 * registered while those pages are mounted, ahead of navigation.
 */
export interface PageCommand {
  /** Unique across the app. A later registration of the same id replaces an earlier one. */
  id: string;
  title: string;
  /** The page the command belongs to; the palette matches on it too. */
  group?: string;
  /** Extra words the palette's search matches, e.g. the button's own label. */
  keywords?: string[];
  /** A shortcut label shown beside the title, e.g. "⌘S". Display only. */
  shortcut?: string;
  /** Mirrors the page button's disabled state: listed, but not runnable. */
  disabled?: boolean;
  run: () => void | Promise<unknown>;
}

interface Registration {
  token: number;
  commands: readonly PageCommand[];
}

let registrations: Registration[] = [];
let nextToken = 0;
let snapshot: readonly PageCommand[] = [];
const listeners = new Set<() => void>();

/**
 * Duplicate ids: the most recent registration wins and takes that position
 * in the list. When it unregisters, the earlier one shows again. A page can
 * therefore take over an app-wide command's id (Settings' "Toggle theme")
 * while it is open.
 */
function rebuild() {
  const byId = new Map<string, PageCommand>();
  for (const registration of registrations) {
    for (const command of registration.commands) {
      byId.delete(command.id);
      byId.set(command.id, command);
    }
  }
  snapshot = Array.from(byId.values());
  for (const listener of listeners) listener();
}

/** Adds commands to the registry. Returns the function that removes them again. */
export function registerCommands(commands: readonly PageCommand[]): () => void {
  const token = nextToken++;
  registrations = [...registrations, { token, commands }];
  rebuild();
  return () => {
    const before = registrations.length;
    registrations = registrations.filter((registration) => registration.token !== token);
    if (registrations.length !== before) rebuild();
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return snapshot;
}

/** Every registered command, in registration order, duplicates resolved. */
export function useCommands(): readonly PageCommand[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Registers `commands` while the calling component is mounted.
 *
 * `deps` decide when the list the palette SHOWS is rebuilt: include whatever
 * changes a title, `disabled`, or whether a command is present. `run` needs
 * no deps: each registered `run` calls the one from the latest render, so it
 * never sees stale state, and a new closure every render re-registers
 * nothing. A command that the latest render dropped or disabled does not run.
 */
export function useRegisterCommands(commands: readonly PageCommand[], deps: DependencyList): void {
  const latest = useRef(commands);
  useLayoutEffect(() => {
    latest.current = commands;
  });
  useEffect(() => {
    const registered = latest.current.map((command) => ({
      ...command,
      run: () => {
        const current = latest.current.find((candidate) => candidate.id === command.id);
        if (!current || current.disabled) return;
        return current.run();
      },
    }));
    return registerCommands(registered);
    // The caller's deps are the contract (see above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
