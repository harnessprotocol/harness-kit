import { getSurface } from "@harness-kit/core";
import type { SurfaceId } from "@harness-kit/core";

/**
 * Short display-label overrides for chips and other tight UI, where the
 * surface registry's full label ("GitHub Copilot (VS Code)") is too long.
 * Every other surface renders the registry label from getSurface().
 */
const SHORT_LABELS: Partial<Record<SurfaceId, string>> = {
  "copilot-vscode": "Copilot",
  "copilot-cli": "Copilot CLI",
  codex: "Codex",
  pi: "Pi",
};

/** UI display label for a surface — short override first, registry label otherwise. */
export function surfaceLabel(id: SurfaceId): string {
  return SHORT_LABELS[id] ?? getSurface(id).label;
}
