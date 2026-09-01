import { homeDir } from "@tauri-apps/api/path";
import {
  applyCellAction,
  buildAgentPrompt,
  createHomeTransactionRoot,
  planCellAction,
  syncCliCommand,
} from "@harness-kit/core";
import type { CellActionPlan, CellActionRequest, GridRow, SurfaceId } from "@harness-kit/core";
import { TauriFsProvider } from "../../lib/harness-fs";
import { TauriSurfaceFsProvider } from "../../lib/surface-fs";
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
export async function applyCellActionViaTauri(
  view: CellActionView,
  /** The user's explicit acknowledgement of capability loss (AC-34). */
  confirmedLoss = false,
): Promise<string[]> {
  const home = await homeDir();
  const result = await applyCellAction(
    view.plan,
    {
      fs: new TauriSurfaceFsProvider(home),
      timestamp: new Date().toISOString().replace(/[:.]/g, "-"),
      roots: { home: createHomeTransactionRoot(home, detectDesktopPlatform()) },
    },
    // Not `true`: a disabled button is UX, not a boundary. The engine's own
    // gate must see the real acknowledgement.
    { homeRoot: home, confirmed: confirmedLoss },
  );
  return result.written;
}
