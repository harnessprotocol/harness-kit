import { homeDir } from "@tauri-apps/api/path";
import {
  applyCellAction,
  buildAgentPrompt,
  createHomeTransactionRoot,
  planCellAction,
  recordAppliedTransaction,
  syncCliCommand,
} from "@harness-kit/core";
import type { CellActionPlan, CellActionRequest, GridRow, SurfaceId } from "@harness-kit/core";
import { TauriFsProvider } from "../../lib/harness-fs";
import { TauriSurfaceFsProvider } from "../../lib/surface-fs";
import { TauriTransactionLedger } from "../../lib/state-ledger";
import { detectDesktopPlatform } from "./machine-data";

/**
 * The three action surfaces for one grid cell (AC-11).
 *
 * Planning runs the same core engine the CLI runs, in the webview. Only the
 * WRITE crosses into Rust, through apply_surface_transaction — which
 * re-validates every path against its own embedded allowlist rather than
 * trusting anything the webview computed here (AC-36).
 */
export interface CellActionView {
  request: CellActionRequest;
  plan: CellActionPlan;
  cli: string;
  prompt: string;
}

/** Surfaces this row is missing from, as action targets. */
export function missingTargets(row: GridRow): SurfaceId[] {
  return (Object.entries(row.cells) as Array<[SurfaceId, GridRow["cells"][SurfaceId]]>)
    .filter(([, cell]) => cell.status === "absent")
    .map(([id]) => id);
}

/** Surfaces this row is present on, as action sources. */
export function presentSources(row: GridRow): SurfaceId[] {
  return (Object.entries(row.cells) as Array<[SurfaceId, GridRow["cells"][SurfaceId]]>)
    .filter(([, cell]) => cell.status === "present")
    .map(([id]) => id);
}

export async function buildCellAction(
  row: GridRow,
  from: SurfaceId,
  to: SurfaceId,
  scope: "user" | "project" = "user",
): Promise<CellActionView> {
  const home = await homeDir();
  const fs = new TauriFsProvider(home);
  const request: CellActionRequest = { kind: row.kind, name: row.name, from, to, scope };
  const plan = await planCellAction(fs, request, {
    projectRoot: null,
    homeRoot: home,
    platform: detectDesktopPlatform(),
  });
  return {
    request,
    plan,
    cli: syncCliCommand(request),
    prompt: buildAgentPrompt(plan, request),
  };
}

/**
 * Apply a planned action through core's transaction engine.
 *
 * The engine runs in the webview (design D3: one TS engine, Rust is OS
 * plumbing), so the desktop gets what the CLI gets — preimage verification,
 * so an edit made since the drawer opened raises `user-modified-outside`
 * rather than being clobbered (AC-17); preimage backups; and a rollback
 * manifest on disk.
 *
 * An earlier version sent `{path, content}` straight to Rust and had none of
 * those: no stale-edit check, no backup, and nothing applied from the desktop
 * could ever be rolled back.
 *
 * Known gap: no ledger row, because the desktop StateStore bridge does not
 * exist yet. The manifest is on disk and usable via
 * `harness-kit rollback --transaction <path>`; it just will not appear in
 * `rollback --list` until that bridge lands.
 */
export interface CellApplyResult {
  written: string[];
  /**
   * Set when the apply succeeded but its rollback point was not recorded.
   * The caller MUST show this: the files changed, and the user would
   * otherwise believe the change is in `rollback --list` when it is not.
   */
  ledgerError?: string;
}

export async function applyCellActionViaTauri(
  view: CellActionView,
  /** The user's explicit acknowledgement of capability loss (AC-34). */
  confirmedLoss = false,
): Promise<CellApplyResult> {
  const home = await homeDir();
  // Namespaced: the CLI mints ids from the same clock with the same format,
  // and record_transaction does ON CONFLICT DO UPDATE — so a same-millisecond
  // collision would silently overwrite one apply's rollback point with the
  // other's, and they would share a backups/<ts>/ directory too.
  const timestamp = `${new Date().toISOString().replace(/[:.]/g, "-")}-app`;
  const prefix = home.endsWith("/") ? home : `${home}/`;
  // The drawer only ever applies at user scope, so every change is home-rooted
  // and the manifest anchors at home. That is an INVARIANT, not an assumption:
  // the CLI derives both from the change set, and hardcoding them is precisely
  // how the M2 ledger shipped with roots: [] and an unusable manifestRoot. If
  // a project-scope apply is ever added here, this must derive them too —
  // so it is asserted rather than assumed.
  const changes = view.plan.changes.map((change) => {
    if (!change.path.startsWith(prefix)) {
      throw new Error(
        `${change.path} is outside the home root; the ledger's root derivation needs updating`,
      );
    }
    return {
      root: "home" as const,
      path: change.path.slice(prefix.length),
      before: change.before,
      after: change.after,
    };
  });

  const result = await applyCellAction(
    view.plan,
    {
      fs: new TauriSurfaceFsProvider(home),
      timestamp,
      roots: { home: createHomeTransactionRoot(home, detectDesktopPlatform()) },
    },
    // Not `true`: a disabled button is UX, not a boundary. The engine's own
    // gate must see the real acknowledgement.
    { homeRoot: home, confirmed: confirmedLoss },
  );

  // A no-op apply has nothing to roll back, and applyFileTransaction anchors
  // an empty change set at the PROJECT root — recording manifestRoot: home
  // for it would point rollback at a path that does not exist.
  if (changes.length === 0) return { written: result.written };

  const outcome = await recordAppliedTransaction(
    result,
    changes,
    {
      transactionId: timestamp,
      appliedAt: new Date().toISOString(),
      manifestRoot: home,
      surfaces: [view.request.to],
      kinds: [view.request.kind],
      identityKeys: [`${view.request.kind}:${view.request.name.toLowerCase()}`],
    },
    new TauriTransactionLedger(),
  );
  // Returned rather than logged. An earlier version console.warn'd here and
  // called that "surfaced" while the drawer still reported a plain "Applied."
  // — a warning only devtools sees is swallowing with extra steps.
  return {
    written: result.written,
    ...(outcome.error ? { ledgerError: outcome.error } : {}),
  };
}
