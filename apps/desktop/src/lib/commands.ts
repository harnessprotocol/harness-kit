import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type DependencyList } from "react";

/**
 * The command registry behind ⌘K (spec AC-21, design D10). Pages register
 * the actions they already expose as buttons; the palette lists whatever is
 * registered while those pages are mounted, ahead of navigation.
 */
export interface PageCommand {
  /** Unique across the app. For a duplicate id, the later-mounted registration wins. */
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
 * while it is open. "Most recent" is the registration's token, which a
 * `useRegisterCommands` caller keeps for its whole lifetime, so a page that
 * updates its commands keeps both its place and its precedence.
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

/** Sets the commands held under `token`, in place if it is registered, else in token order. */
function upsert(token: number, commands: readonly PageCommand[]) {
  const entry = { token, commands };
  const index = registrations.findIndex((registration) => registration.token === token);
  if (index !== -1) {
    registrations = registrations.map((registration, i) => (i === index ? entry : registration));
  } else {
    const after = registrations.findIndex((registration) => registration.token > token);
    registrations =
      after === -1
        ? [...registrations, entry]
        : [...registrations.slice(0, after), entry, ...registrations.slice(after)];
  }
  rebuild();
}

function remove(token: number) {
  const before = registrations.length;
  registrations = registrations.filter((registration) => registration.token !== token);
  if (registrations.length !== before) rebuild();
}

/** Adds commands to the registry. Returns the function that removes them again. */
export function registerCommands(commands: readonly PageCommand[]): () => void {
  const token = nextToken++;
  upsert(token, commands);
  return () => remove(token);
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
 * changes a title, `disabled`, or whether a command is present. A rebuild
 * replaces this component's commands in place: they keep their position, and
 * a duplicate id is still decided by when this component first registered.
 * `run` needs no deps: each registered `run` calls the one from the latest
 * render, so it never sees stale state, and a new closure every render
 * re-registers nothing. A command that the latest render dropped or disabled
 * does not run.
 */
export function useRegisterCommands(commands: readonly PageCommand[], deps: DependencyList): void {
  const latest = useRef(commands);
  const token = useRef<number | null>(null);
  useLayoutEffect(() => {
    latest.current = commands;
  });
  useEffect(() => {
    if (token.current === null) token.current = nextToken++;
    const registered = latest.current.map((command) => ({
      ...command,
      run: () => {
        const current = latest.current.find((candidate) => candidate.id === command.id);
        if (!current || current.disabled) return;
        return current.run();
      },
    }));
    upsert(token.current, registered);
    // No cleanup: a deps change replaces the commands in place. The effect
    // below removes them on unmount.
    // The caller's deps are the contract (see above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    // The effect above ran first, in this same commit, so the token is set.
    const own = token.current;
    return () => {
      if (own !== null) remove(own);
    };
  }, []);
}
