import { homeDir } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { buildAgentPrompt, planCellAction, syncCliCommand } from "@harness-kit/core";
import type { CellActionPlan, CellActionRequest, GridRow, SurfaceId } from "@harness-kit/core";
import { TauriFsProvider } from "../../lib/harness-fs";
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

/** One file the Rust command should write, home-relative. */
interface SurfaceFileWrite {
  relativePath: string;
  content: string | null;
}

/**
 * Apply a planned action. Paths are rebased to home-relative here because the
 * Rust command joins them onto the home directory itself — it never accepts a
 * caller-supplied root.
 */
export async function applyCellActionViaTauri(view: CellActionView): Promise<string[]> {
  if (!view.plan.supported) {
    throw new Error(view.plan.reason ?? "this cell cannot be written directly");
  }
  const home = await homeDir();
  const prefix = home.endsWith("/") ? home : `${home}/`;
  const files: SurfaceFileWrite[] = view.plan.changes.map((change) => {
    if (!change.path.startsWith(prefix)) {
      throw new Error(`${change.path} is outside the home directory`);
    }
    return { relativePath: change.path.slice(prefix.length), content: change.after };
  });
  return invoke<string[]>("apply_surface_transaction", { files });
}
