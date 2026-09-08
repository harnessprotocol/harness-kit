import { applyFileTransaction } from "../portability/transaction.js";
import type { TransactionContext } from "../portability/transaction.js";
import type { TransactionFileChange, TransactionResult } from "../portability/types.js";
import type { CellActionPlan } from "./plan-cell-action.js";
import type { FsProvider } from "../fs-provider.js";
import type { ProcessRunner } from "../process-runner.js";
import type { SurfaceId } from "../surfaces/types.js";
import type { StateStore } from "../state/store.js";
import { executePluginAction } from "../plugins/broker.js";
import type { PluginActionOutcome } from "../plugins/broker.js";

/**
 * Why a cell action could not be applied, in the vocabulary the UI and CLI
 * both speak. A raw "transaction precondition failed" is an engine detail;
 * `user-modified-outside` is the thing the user has to decide about, and it
 * matches the class fix/detect.ts already reports (AC-17).
 */
export type CellActionErrorCode =
  | "unsupported"
  | "loss-unconfirmed"
  | "user-modified-outside"
  | "apply-failed";

export class CellActionError extends Error {
  readonly code: CellActionErrorCode;
  /** Files involved, for the message the caller renders. */
  readonly files: string[];

  constructor(code: CellActionErrorCode, message: string, files: string[] = []) {
    super(message);
    this.name = "CellActionError";
    this.code = code;
    this.files = files;
  }
}

export interface ApplyCellActionOptions {
  /** Absolute home root; plan paths are rebased onto it. */
  homeRoot: string;
  /** Absolute project root, when the plan touches project-scope stores. */
  projectRoot?: string;
  /** Explicit confirmation for a plan that reports capability loss (AC-34). */
  confirmed?: boolean;
  /**
   * Everything a `plugin` plan needs to execute. Required when the plan
   * carries one: plugins do not go through the transaction engine, so
   * applying such a plan without these would write nothing and report
   * success — the failure mode this option exists to make impossible.
   */
  plugin?: {
    runner: ProcessRunner;
    fs: FsProvider;
    /** Injected clock — core never reads the system clock. */
    now: string;
    /** Surface to copy plugin contents from, for the unpack driver. */
    sourceSurface?: SurfaceId;
    /** Records the install so an unpack can be undone later (AC-19). */
    state?: Pick<StateStore, "recordPluginInstall">;
  };
}

/** Absolute path -> (root, root-relative path). */
function rebase(
  path: string,
  options: ApplyCellActionOptions,
): { root: "project" | "home"; path: string } {
  const candidates = [
    ...(options.projectRoot ? [{ root: "project" as const, base: options.projectRoot }] : []),
    { root: "home" as const, base: options.homeRoot },
  ];
  for (const { root, base } of candidates) {
    const prefix = base.endsWith("/") ? base : `${base}/`;
    if (path.startsWith(prefix)) return { root, path: path.slice(prefix.length) };
  }
  throw new CellActionError(
    "apply-failed",
    `${path} is outside every configured transaction root`,
    [path],
  );
}

/** The engine's stale-preimage message prefix and its three suffixes. */
const PRECONDITION_PREFIX = "transaction precondition failed: ";
const PRECONDITION_SUFFIXES = [" now exists", " was removed", " changed after preview"] as const;

/**
 * Extract the path from a stale-preimage message, or null if it is not one.
 *
 * Deliberately not a regex. `(.+?) (?:a|b|c)` is polynomial-backtracking on a
 * long non-matching input (CodeQL js/polynomial-redos), and the message shape
 * is fixed enough that prefix/suffix matching is both linear and clearer.
 */
function stalePreimagePath(message: string): string | null {
  if (!message.startsWith(PRECONDITION_PREFIX)) return null;
  const body = message.slice(PRECONDITION_PREFIX.length);
  for (const suffix of PRECONDITION_SUFFIXES) {
    if (body.endsWith(suffix)) return body.slice(0, -suffix.length);
  }
  return null;
}

/**
 * Apply a planned cell action through the transaction engine.
 *
 * Two gates before anything is written:
 * - an unsupported plan is refused outright (there is nothing to apply);
 * - a plan reporting capability loss is refused unless explicitly confirmed,
 *   so loss is never discovered after the config changed (AC-34).
 *
 * A stale preimage — someone edited the file between preview and apply — is
 * re-raised as `user-modified-outside` rather than the engine's internal
 * precondition wording (AC-17). The engine has already restored everything
 * it touched by that point, so the outside edit survives.
 */
export async function applyCellAction(
  plan: CellActionPlan,
  context: TransactionContext,
  options: ApplyCellActionOptions,
): Promise<TransactionResult> {
  if (!plan.supported) {
    throw new CellActionError("unsupported", plan.reason ?? "this cell cannot be written directly");
  }
  if (plan.plugin !== undefined) {
    throw new CellActionError(
      "unsupported",
      "this is a plugin action — run it with applyPluginCellAction, which drives the surface's installer rather than a file transaction",
    );
  }
  if (plan.requiresConfirmation && options.confirmed !== true) {
    const fields = (plan.loss?.losses ?? []).map((loss) => loss.detail).join("; ");
    throw new CellActionError(
      "loss-unconfirmed",
      `${plan.target?.file ?? "target"} cannot fully express this resource (${fields}) — confirm to apply anyway`,
      plan.target ? [plan.target.file] : [],
    );
  }

  const changes: TransactionFileChange[] = plan.changes.map((change) => {
    const { root, path } = rebase(change.path, options);
    return { root, path, before: change.before, after: change.after };
  });

  const result = await applyFileTransaction(changes, context).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const stale = stalePreimagePath(message);
    if (stale !== null) {
      throw new CellActionError(
        "user-modified-outside",
        `${stale} changed outside HarnessKit since this action was previewed — re-read it and try again`,
        [stale],
      );
    }
    throw new CellActionError("apply-failed", message);
  });

  if (!result.committed) {
    throw new CellActionError(
      "apply-failed",
      result.error ?? "the transaction did not commit",
      [...result.written, ...result.removed],
    );
  }
  return result;
}

/**
 * Apply a `plugin` cell action (AC-18, AC-19).
 *
 * Separate from applyCellAction because it is a different mechanism, not a
 * different case: no preimage, no backup, no rollback manifest, because
 * nothing here writes a config store HarnessKit owns. The surface's own
 * installer is the source of truth for undoing a native install; only the
 * unpack driver's files are ours to remove, and those are what get recorded.
 */
export async function applyPluginCellAction(
  plan: CellActionPlan,
  options: NonNullable<ApplyCellActionOptions["plugin"]> & {
    surface: SurfaceId;
    identity: string;
    /** Home root — the unpack driver resolves the plugin's cached files under it. */
    homeRoot: string;
  },
): Promise<PluginActionOutcome> {
  if (plan.plugin === undefined) {
    throw new CellActionError("unsupported", "this plan is not a plugin action");
  }
  if (!plan.supported) {
    throw new CellActionError("unsupported", plan.reason ?? "this plugin cell cannot be actioned");
  }

  const outcome = await executePluginAction(plan.plugin, {
    runner: options.runner,
    fs: options.fs,
    now: options.now,
    ...(options.sourceSurface !== undefined ? { sourceSurface: options.sourceSurface } : {}),
    homeRoot: options.homeRoot,
  });

  // Recording is best-effort by design: the plugin is already on disk by the
  // time this runs, so a state-store failure must not turn a successful
  // install into a reported failure. The cost of losing the row is that an
  // unpacked plugin cannot be cleanly removed later, which is worth stating
  // rather than hiding.
  // Installs only. `plugin_installs` is the record of what HarnessKit PUT
  // somewhere; writing a row for an uninstall would make listPluginInstalls
  // report a removed plugin as present.
  if (options.state !== undefined && outcome.status === "installed") {
    try {
      await options.state.recordPluginInstall({
        surface: options.surface,
        plugin: options.identity,
        manifestDigest: "",
        files: outcome.files,
        installedAt: options.now,
      });
    } catch {
      // Swallowed deliberately — see above.
    }
  }
  return outcome;
}
