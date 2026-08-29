/**
 * Build-time capability matrix generator.
 *
 * Reads `@harness-kit/core`'s portability registry directly — the same
 * exhaustive resource, operation, and scope declarations reconciliation uses — and
 * emits a static JSON snapshot that `website/` renders. This is the only
 * path that produces `capability-matrix.generated.json`; there is no
 * hand-authored fallback, so the public table cannot drift from runtime policy.
 *
 * Mirrors `packages/marketplace-data/src/generate.ts` (git → static JSON at
 * build time, run from the repo root before `website`'s own install/build —
 * see `.github/workflows/deploy-docs.yml`'s "Generate marketplace data"
 * step for the precedent this follows).
 *
 * Run via `pnpm run generate:capability-matrix` from the repo root (builds
 * `@harness-kit/core` first), or directly:
 *   pnpm --filter @harness-kit/core build
 *   pnpm --filter @harness-kit/website-data generate
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PORTABLE_RESOURCE_KINDS,
  TARGETS,
  TARGET_CAPABILITY_MATRIX,
} from "@harness-kit/core";
import type {
  CapabilityLevel,
  HarnessResourceKind,
  HarnessScope,
  LifecycleOperation,
  TargetPlatform,
} from "@harness-kit/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");
const OUT_PATH = join(repoRoot, "website", "lib", "capability-matrix.generated.json");

const RESOURCE_LABELS: Record<HarnessResourceKind, string> = {
  plugin: "Plugins",
  skill: "Skills",
  "mcp-server": "MCP servers",
  env: "Environment",
  instructions: "Instructions",
  permissions: "Permissions",
  "architectural-constraints": "Architecture",
  policy: "Policy",
  extends: "Inheritance",
  "native-extension": "Native extensions",
};

export interface CapabilityCell {
  resource: HarnessResourceKind;
  operations: Record<LifecycleOperation, CapabilityLevel>;
  scopes: Record<HarnessScope, CapabilityLevel>;
  note?: string;
}

export interface CapabilityRow {
  id: TargetPlatform;
  label: string;
  cells: CapabilityCell[];
}

export interface CapabilityMatrix {
  generatedAt: string;
  resources: { id: HarnessResourceKind; label: string }[];
  rows: CapabilityRow[];
}

function buildMatrix(): CapabilityMatrix {
  const rows: CapabilityRow[] = TARGETS.map(({ id, label }) => {
    return {
      id,
      label,
      cells: PORTABLE_RESOURCE_KINDS.map((resource) => {
        const capability = TARGET_CAPABILITY_MATRIX.find((entry) => entry.target === id && entry.resource === resource);
        if (!capability) throw new Error(`missing capability cell for ${id}/${resource}`);
        return {
          resource,
          operations: capability.operations,
          scopes: capability.scopes,
          ...(capability.note ? { note: capability.note } : {}),
        };
      }),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    resources: PORTABLE_RESOURCE_KINDS.map((id) => ({ id, label: RESOURCE_LABELS[id] })),
    rows,
  };
}

async function main() {
  const matrix = buildMatrix();
  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, `${JSON.stringify(matrix, null, 2)}\n`, "utf-8");
  const native = matrix.rows.reduce(
    (n, r) => n + r.cells.filter((c) => c.operations.apply === "native").length,
    0,
  );
  const none = matrix.rows.reduce(
    (n, r) => n + r.cells.filter((c) => c.operations.apply === "unsupported").length,
    0,
  );
  console.log(
    `Generated capability matrix: ${matrix.rows.length} targets x ${matrix.resources.length} resources ` +
      `(${native} native, ${none} unsupported) -> ${OUT_PATH}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
