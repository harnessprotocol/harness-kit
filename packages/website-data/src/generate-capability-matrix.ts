/**
 * Build-time capability matrix generator.
 *
 * Reads `@harness-kit/core`'s adapter registry directly — the same
 * `capabilities` declarations the compiler and importer use at runtime — and
 * emits a static JSON snapshot that `website/` renders. This is the only
 * path that produces `capability-matrix.generated.json`; there is no
 * hand-authored fallback, so the marketing table can never drift from the
 * adapters' real declared capabilities.
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
import { getAllAdapters } from "@harness-kit/core";
import type { AdapterId, FeatureSupport, HarnessDomain } from "@harness-kit/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");
const OUT_PATH = join(repoRoot, "website", "lib", "capability-matrix.generated.json");

/** Display order + labels for the 7 domains. Order only — values come from the adapters. */
const DOMAIN_ORDER: { id: HarnessDomain; label: string }[] = [
  { id: "instructions", label: "Instructions" },
  { id: "skills", label: "Skills" },
  { id: "subagents", label: "Subagents" },
  { id: "mcp", label: "MCP" },
  { id: "permissions", label: "Permissions" },
  { id: "hooks", label: "Hooks" },
  { id: "model", label: "Model" },
];

/** Display order + labels for the 6 first-class adapter targets. */
const TARGET_ORDER: { id: AdapterId; label: string }[] = [
  { id: "claude-code", label: "Claude Code" },
  { id: "cursor", label: "Cursor" },
  { id: "copilot", label: "Copilot" },
  { id: "opencode", label: "opencode" },
  { id: "pi", label: "pi" },
  { id: "agents-md", label: "AGENTS.md" },
];

export interface CapabilityCell {
  domain: HarnessDomain;
  export: FeatureSupport;
  import: FeatureSupport;
}

export interface CapabilityRow {
  id: AdapterId;
  label: string;
  scopes: ("project" | "global")[];
  diff: boolean;
  cells: CapabilityCell[];
}

export interface CapabilityMatrix {
  generatedAt: string;
  domains: { id: HarnessDomain; label: string }[];
  rows: CapabilityRow[];
}

function buildMatrix(): CapabilityMatrix {
  const adapters = getAllAdapters();
  const byId = new Map(adapters.map((a) => [a.id, a]));

  const rows: CapabilityRow[] = TARGET_ORDER.map(({ id, label }) => {
    const adapter = byId.get(id);
    if (!adapter) {
      throw new Error(
        `generate-capability-matrix: no registered adapter for target '${id}' — ` +
          `check TARGET_ORDER against @harness-kit/core's getAllAdapters()`,
      );
    }
    return {
      id,
      label,
      scopes: adapter.capabilities.scopes,
      diff: adapter.capabilities.diff,
      cells: DOMAIN_ORDER.map(({ id: domainId }) => ({
        domain: domainId,
        export: adapter.capabilities.export[domainId],
        import: adapter.capabilities.import[domainId],
      })),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    domains: DOMAIN_ORDER,
    rows,
  };
}

async function main() {
  const matrix = buildMatrix();
  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, `${JSON.stringify(matrix, null, 2)}\n`, "utf-8");
  const full = matrix.rows.reduce(
    (n, r) => n + r.cells.filter((c) => c.export === "full").length,
    0,
  );
  const none = matrix.rows.reduce(
    (n, r) => n + r.cells.filter((c) => c.export === "none").length,
    0,
  );
  console.log(
    `Generated capability matrix: ${matrix.rows.length} targets x ${matrix.domains.length} domains ` +
      `(${full} full, ${none} none) -> ${OUT_PATH}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
