import type { FsProvider } from "../fs-provider.js";
import type { ObserveOptions } from "../observe/observe-surface.js";
import { readStore } from "../observe/read-store.js";
import type { StoreEntry } from "../observe/read-store.js";
import type { HarnessResourceKind } from "../portability/types.js";
import { buildLossReport } from "../portability/capabilities.js";
import type { HarnessResource, LossReport } from "../portability/types.js";
import { looksLikeSecret } from "../portability/secrets.js";
import { getSurface } from "../surfaces/registry.js";
import type { ConfigStore, StoreFormatId, SurfaceId, SurfaceScope } from "../surfaces/types.js";
import { isRecord } from "../utils/is-record.js";
import { planStoreWrite } from "./write-store.js";
import type { PlannedFileChange } from "./write-store.js";

/**
 * Close one grid cell's gap: copy a single resource from one surface to
 * another (AC-15).
 *
 * Deliberately *not* built from the machine inventory's canonicalForm.
 * canonicalForm is secret-sanitized before it is ever digested or persisted,
 * so a copy built from it would write `<secret>` placeholders into the
 * target and produce a config that cannot connect. A same-machine copy
 * re-reads the source store's literal value instead, and reports
 * `carriesSecret` so the UI can badge it (AC-21). Exports remain sanitized —
 * that is AC-22's path, not this one.
 */
export interface CellActionRequest {
  kind: HarnessResourceKind;
  /** Resource display name; matched case-insensitively, as identity keys are. */
  name: string;
  from: SurfaceId;
  to: SurfaceId;
  /** Scope to write on the target. */
  scope: SurfaceScope;
}

export interface CellActionPlan {
  supported: boolean;
  /** Present when `supported` is false. */
  reason?: string;
  /** Empty when the target already matches — a no-op, not a failure. */
  changes: PlannedFileChange[];
  /** True when the target already holds this exact content. */
  noop: boolean;
  /** True when the copied value contains a secret-looking literal (AC-21). */
  carriesSecret: boolean;
  /**
   * What the target cannot fully express, per the capability matrix, or null
   * when the copy is lossless (AC-34). Present even on an unsupported plan —
   * the reason a cell cannot be written is exactly what the user needs shown.
   */
  loss: LossReport | null;
  /**
   * True only when some loss is genuine — the target cannot express the
   * resource at all. A "translated" loss is informational: the resource IS
   * expressed, just mapped into the surface's native shape, which is what
   * the writer does anyway. Gating on translation would demand confirmation
   * for nearly every copy and train people to click through the one prompt
   * that matters.
   */
  requiresConfirmation: boolean;
  /**
   * The source resource's literal value. Present whenever the source was
   * found — the agent prompt needs it to describe what to reproduce, and
   * sanitizes it itself rather than receiving a pre-sanitized copy.
   */
  value?: unknown;
  source?: { file: string; formatId: StoreFormatId };
  target?: { file: string; formatId: StoreFormatId };
}

function refuse(reason: string, loss: LossReport | null = null): CellActionPlan {
  return {
    supported: false,
    reason,
    changes: [],
    noop: false,
    carriesSecret: false,
    loss,
    requiresConfirmation: false,
  };
}

/** Whether a report contains loss beyond mere translation into native shape. */
function hasGenuineLoss(loss: LossReport | null): boolean {
  return (loss?.losses ?? []).some((item) => item.capability !== "translated");
}

/**
 * Ask the capability matrix what the target loses. The matrix speaks
 * HarnessResource, so the cell request is adapted to one — "user" scope is
 * the portability layer's "personal".
 */
function lossFor(
  request: CellActionRequest,
  entry: StoreEntry,
  sourceFile: string,
): LossReport | null {
  const scope = request.scope === "user" ? "personal" : "project";
  const resource: HarnessResource = {
    identity: { kind: request.kind, source: sourceFile, name: entry.name },
    alias: entry.name,
    scope,
    value: entry.value,
    provenance: { adapter: request.from, file: sourceFile, scope },
  };
  // "apply" is the lifecycle operation a cell action performs — it writes a
  // resource into a surface's native store.
  const report = buildLossReport(request.to, [resource], "apply");
  return report.losses.length > 0 ? report : null;
}

/** Resolve a store's absolute path for this platform and scope. */
function storePath(fs: FsProvider, store: ConfigStore, opts: ObserveOptions): string | null {
  const relative = store.pathByPlatform?.[opts.platform] ?? store.path;
  if (store.scope === "user") return fs.joinPath(opts.homeRoot, relative);
  if (opts.projectRoot === null) return null;
  return fs.joinPath(opts.projectRoot, relative);
}

/** Whether any string in a value looks like a credential. */
function containsSecret(value: unknown, key = ""): boolean {
  if (typeof value === "string") return looksLikeSecret(key, value);
  if (Array.isArray(value)) return value.some((item) => containsSecret(item, key));
  if (isRecord(value)) {
    return Object.entries(value).some(([childKey, child]) => containsSecret(child, childKey));
  }
  return false;
}

/** Find one named entry across a surface's stores for a kind, nearest-wins. */
async function findEntry(
  fs: FsProvider,
  surface: SurfaceId,
  kind: HarnessResourceKind,
  name: string,
  opts: ObserveOptions,
): Promise<{ entry: StoreEntry; path: string } | null> {
  const wanted = name.toLowerCase();
  // Project scope beats user scope, matching the inventory's precedence.
  const stores = getSurface(surface).stores.filter((store) => store.kind === kind);
  const ordered = [
    ...stores.filter((store) => store.scope === "project"),
    ...stores.filter((store) => store.scope === "user"),
  ];
  for (const store of ordered) {
    const path = storePath(fs, store, opts);
    if (path === null) continue;
    const result = await readStore(fs, store, path);
    const entry = result.entries.find(
      (candidate) => candidate.kind === kind && candidate.name.toLowerCase() === wanted,
    );
    if (entry) return { entry, path };
  }
  return null;
}

/**
 * Plan the file changes that close one cell's gap. Never throws: an
 * unwritable cell comes back `supported: false` with a reason, so the caller
 * can still offer the CLI command and agent prompt (AC-13).
 */
export async function planCellAction(
  fs: FsProvider,
  request: CellActionRequest,
  opts: ObserveOptions,
): Promise<CellActionPlan> {
  const found = await findEntry(fs, request.from, request.kind, request.name, opts);
  if (!found) {
    return refuse(
      `'${request.name}' (${request.kind}) is absent on ${request.from} — nothing to copy.`,
    );
  }
  const loss = lossFor(request, found.entry, found.path);

  const targetStore = getSurface(request.to).stores.find(
    (store) => store.kind === request.kind && store.scope === request.scope,
  );
  if (!targetStore) {
    return {
      ...refuse(
        `${request.to} has no ${request.scope}-scope store for '${request.kind}' — use the agent prompt for this cell.`,
        loss,
      ),
      // The prompt still needs the value: a cell with no write path is
      // exactly the case the agent prompt exists to cover (AC-13).
      value: found.entry.value,
      source: { file: found.path, formatId: found.entry.provenance.formatId },
    };
  }
  const targetPath = storePath(fs, targetStore, opts);
  if (targetPath === null) {
    return {
      ...refuse(`${request.to}'s ${request.scope} store needs a project context.`, loss),
      value: found.entry.value,
    };
  }

  const written = await planStoreWrite(fs, targetStore, targetPath, {
    kind: request.kind,
    // Carry the SOURCE's display name so casing survives the copy.
    name: found.entry.name,
    value: found.entry.value,
  });
  const source = { file: found.path, formatId: found.entry.provenance.formatId };
  const target = { file: targetPath, formatId: targetStore.formatId };
  if (!written.supported) {
    return { ...refuse(written.reason, loss), value: found.entry.value, source, target };
  }

  // A change whose after equals its before is not a change.
  const changes = written.changes.filter((change) => change.after !== change.before);
  return {
    supported: true,
    changes,
    noop: changes.length === 0,
    carriesSecret: containsSecret(found.entry.value),
    value: found.entry.value,
    loss,
    requiresConfirmation: hasGenuineLoss(loss),
    source,
    target,
  };
}

/**
 * The exact `harness-kit sync` invocation that reproduces one cell action.
 *
 * Shared by the CLI and the desktop drawer so the string the UI displays is
 * literally the string the CLI parses (AC-28) — two hand-written formatters
 * would drift the moment a flag changed.
 */
export function syncCliCommand(request: CellActionRequest): string {
  return [
    "harness-kit sync",
    `--from ${request.from}`,
    `--to ${request.to}`,
    `--only ${request.kind}:${request.name}`,
    `--scope ${request.scope}`,
    "--yes",
  ].join(" ");
}
