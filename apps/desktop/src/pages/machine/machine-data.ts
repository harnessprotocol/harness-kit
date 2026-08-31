import { homeDir } from "@tauri-apps/api/path";
import { buildMachineInventory } from "@harness-kit/core";
import type { MachineInventory } from "@harness-kit/core";
import { TauriFsProvider } from "../../lib/harness-fs";
import { grantProjectScope } from "../../lib/tauri";

/**
 * Map the webview's platform to the ObserveOptions platform id. Core NEVER
 * reads process.platform, and the desktop has no plugin-os dependency, so
 * the webview UA/platform string is the detection source (mirrors how the
 * app is a native Tauri WebView — the UA reliably carries the host OS).
 */
export function detectDesktopPlatform(): "darwin" | "win32" | "linux" {
  const signature = `${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`;
  if (/mac/i.test(signature)) return "darwin";
  if (/win/i.test(signature)) return "win32";
  return "linux";
}

/**
 * Run the core machine-inventory engine over this machine (mirrors
 * portability-data.ts: TauriFsProvider + Tauri homeDir resolution, engine
 * runs entirely in the webview — no Rust commands).
 *
 * `scanRoot` is the optional project directory; null = machine-only
 * observation (user-scope stores only). A project dir needs a runtime FS
 * scope grant first (the static capability only covers known $HOME config
 * roots) — mirroring Fleet, a failed grant drops the project from the scan
 * rather than failing the whole inventory.
 */
export async function loadMachineInventory(scanRoot: string | null): Promise<MachineInventory> {
  const home = await homeDir();
  let projectRoot: string | null = null;
  if (scanRoot) {
    projectRoot = await grantProjectScope(scanRoot).then(
      () => scanRoot,
      () => null,
    );
  }
  const fs = new TauriFsProvider(home);
  return buildMachineInventory(fs, {
    projectRoot,
    homeRoot: home,
    platform: detectDesktopPlatform(),
  });
}
