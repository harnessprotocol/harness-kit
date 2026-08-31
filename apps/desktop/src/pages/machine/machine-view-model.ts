import { getSurface } from "@harness-kit/core";
import type { MachineInventory, ProductFamily, SurfaceId } from "@harness-kit/core";

/** Display labels for resource kinds (row-section headers, NA tooltips). */
export const KIND_LABELS: Record<string, string> = {
  "mcp-server": "MCP servers",
  skill: "Skills",
  instructions: "Instructions",
  permissions: "Permissions",
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
