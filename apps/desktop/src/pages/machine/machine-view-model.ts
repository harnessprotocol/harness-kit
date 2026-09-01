import { getSurface } from "@harness-kit/core";
import type {
  HarnessResourceKind,
  MachineInventory,
  ProductFamily,
  SurfaceId,
} from "@harness-kit/core";

/**
 * Display labels for resource kinds (row-section headers, NA tooltips).
 * Exhaustive over HARNESS_RESOURCE_KINDS — the Record type fails to compile
 * if core adds a kind, so headers/tooltips never fall back to raw ids.
 */
export const KIND_LABELS: Record<HarnessResourceKind, string> = {
  plugin: "Plugins",
  skill: "Skills",
  "mcp-server": "MCP servers",
  env: "Environment variables",
  instructions: "Instructions",
  permissions: "Permissions",
  "architectural-constraints": "Architectural constraints",
  policy: "Policies",
  extends: "Extends",
  "native-extension": "Native extensions",
};

/** `sha256:abcdef…` → `abcdef12` (short-hash for tooltips/drawer). */
export function shortDigest(digest: string): string {
  const raw = digest.includes(":") ? digest.slice(digest.indexOf(":") + 1) : digest;
  return raw.slice(0, 8);
}

export interface FamilyGroup {
  family: ProductFamily;
  surfaces: SurfaceId[];
}

/**
 * Group the inventory's surfaces (registry order — families are contiguous
 * there) into consecutive product-family column groups.
 */
export function familyGroups(surfaces: MachineInventory["surfaces"]): FamilyGroup[] {
  const groups: FamilyGroup[] = [];
  for (const surface of surfaces) {
    const family = getSurface(surface.id).family;
    const last = groups[groups.length - 1];
    if (last && last.family === family) {
      last.surfaces.push(surface.id);
    } else {
      groups.push({ family, surfaces: [surface.id] });
    }
  }
  return groups;
}
