import { applyFileTransaction } from "../portability/transaction.js";
import type { TransactionContext } from "../portability/transaction.js";
import type { TransactionFileChange, TransactionResult } from "../portability/types.js";
import type { CellActionPlan } from "./plan-cell-action.js";

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

/** The engine's stale-preimage messages, which AC-17 renames. */
const PRECONDITION = /transaction precondition failed: (.+?) (?:now exists|was removed|changed after preview)/;

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
    const stale = PRECONDITION.exec(message);
    if (stale) {
      throw new CellActionError(
        "user-modified-outside",
        `${stale[1]} changed outside HarnessKit since this action was previewed — re-read it and try again`,
        [stale[1]!],
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
