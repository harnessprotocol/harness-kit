import { useSyncExternalStore } from "react";
import { importPluginFromPath, importPluginFromZip } from "../../../lib/tauri";
import type { ImportStatus } from "./ImportBanner";
import { describeImportError, folderName, isZipPath, type ImportError } from "./import-errors";

/**
 * The plugin import queue, one for the app session rather than one per
 * PluginsPage. Rust checks whether a plugin is installed and then copies it,
 * so two imports of the same folder must never run side by side. A queue held
 * by the page would be lost when the page unmounts mid-batch, and dropping the
 * folder again after coming back would start a second loop next to the first.
 *
 * Imports run one at a time. Paths that arrive while a batch runs join its
 * queue, and a path already in the batch is skipped. The page reads the state
 * with useImportQueue and hears about finished imports through
 * onPluginsImported, both only while mounted, so nothing here sets state on
 * an unmounted page. A result that lands while the page is away stays until
 * it is dismissed or the next batch starts, so coming back shows it.
 */

export interface ImportQueueState {
  importing: boolean;
  status: ImportStatus | null;
}

interface ImportBatch {
  seen: Set<string>;
  queue: string[];
  imported: string[];
  failures: { name: string; error: ImportError }[];
}

const IDLE: ImportQueueState = { importing: false, status: null };

let state: ImportQueueState = IDLE;
let batch: ImportBatch | null = null;
const stateListeners = new Set<() => void>();
const importedListeners = new Set<() => void>();

function setState(next: Partial<ImportQueueState>) {
  state = { ...state, ...next };
  for (const listener of stateListeners) listener();
}

function subscribe(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

function getState(): ImportQueueState {
  return state;
}

/** The queue's state, for as long as the calling component is mounted. */
export function useImportQueue(): ImportQueueState {
  return useSyncExternalStore(subscribe, getState);
}

/** Calls `listener` after a batch that imported at least one plugin. Returns the unsubscribe. */
export function onPluginsImported(listener: () => void): () => void {
  importedListeners.add(listener);
  return () => {
    importedListeners.delete(listener);
  };
}

/** Clears the banner's result. Stable, so it can be an effect dependency. */
export function dismissImportStatus(): void {
  if (state.status !== null) setState({ status: null });
}

/**
 * Imports `paths`, queued behind any running batch. The Rust commands do the
 * validation (is it a directory, does it carry .claude-plugin/plugin.json, is
 * it already installed). Starting a batch resolves when that batch is done;
 * joining a running batch resolves at once (the running loop picks the paths
 * up). Callers follow progress through the subscription, not this promise.
 */
export async function enqueueImports(paths: string[]): Promise<void> {
  const running = batch;
  const current: ImportBatch = running ?? { seen: new Set<string>(), queue: [], imported: [], failures: [] };
  for (const path of paths) {
    if (current.seen.has(path)) continue;
    current.seen.add(path);
    current.queue.push(path);
  }
  if (running) return;

  batch = current;
  setState({ importing: true });
  try {
    for (let path = current.queue.shift(); path !== undefined; path = current.queue.shift()) {
      const name = folderName(path);
      setState({ status: { state: "importing", name } });
      try {
        const plugin = await (isZipPath(path) ? importPluginFromZip(path) : importPluginFromPath(path));
        current.imported.push(plugin?.name || name);
      } catch (err) {
        current.failures.push({ name, error: describeImportError(err, name) });
      }
    }
  } finally {
    batch = null;
    setState({ importing: false, status: batchResult(current) });
  }

  if (current.imported.length > 0) {
    for (const listener of importedListeners) listener();
  }
}

/** One banner for a finished batch; null when nothing was imported or failed. */
function batchResult({ imported, failures }: ImportBatch): ImportStatus | null {
  if (failures.length === 0) {
    return imported.length > 0 ? { state: "success", name: imported.join(", ") } : null;
  }
  const alsoImported = imported.length > 0 ? ` Imported ${imported.join(", ")}.` : "";
  if (failures.length === 1) {
    const { error } = failures[0];
    return { state: "error", ...error, title: error.title + alsoImported };
  }
  const actions = new Set(failures.map((f) => f.error.action));
  return {
    state: "error",
    title: `${failures.length} failed: ${failures.map((f) => f.name).join(", ")}.${alsoImported}`,
    action: actions.size === 1 ? failures[0].error.action : "Open Details for each reason.",
    details: failures
      .map(({ name, error }) =>
        [`${name}: ${error.title}${error.action ? ` ${error.action}` : ""}`, error.details].filter(Boolean).join("\n"))
      .join("\n\n"),
  };
}

/** Tests only: forget any state left by a previous test. Does not stop a running batch. */
export function resetImportQueueForTests(): void {
  batch = null;
  state = IDLE;
}
