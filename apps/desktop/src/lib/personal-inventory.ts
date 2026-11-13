import { homeDir } from "@tauri-apps/api/path";
import { importFromInventory } from "@harness-kit/core";
import type { InventoryImportResult } from "@harness-kit/core";
import { TauriFsProvider } from "./harness-fs";
import { resolveDesktopDefinitions } from "./definitions";
import { detectDesktopPlatform } from "../pages/machine/machine-data";

/**
 * Build the personal harness.yaml (`~/.claude/harness.yaml`) from the same
 * machine inventory the Machine grid shows (AC-56): user-scope stores only,
 * the registry from the verified definitions bundle when one resolves, and the
 * same platform detection `loadMachineInventory` uses. No project is read, so
 * the personal profile never absorbs a project's committed servers (AC-55).
 */
export async function importPersonalHarness(
  meta?: { name?: string; description?: string },
): Promise<InventoryImportResult> {
  const home = await homeDir();
  const definitions = await resolveDesktopDefinitions();
  return importFromInventory(
    new TauriFsProvider(home),
    { projectRoot: null, homeRoot: home, platform: detectDesktopPlatform() },
    definitions.surfaces,
    meta,
  );
}
