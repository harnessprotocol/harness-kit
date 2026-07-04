import { stringify as stringifyYaml } from "yaml";
import type { FsProvider } from "../fs-provider.js";
import type { HarnessConfig } from "../types.js";
import { getAllAdapters } from "../adapters/registry.js";
import type { AdapterContext } from "../adapters/adapter.js";
import { validateHarness } from "../schema/validate.js";
import type { AdapterImportResult, ImportProjectResult } from "./types.js";
import { synthesize } from "./synthesize.js";

export interface ImportContext {
  fs: FsProvider;
  /** harness.yaml metadata.name for the synthesized profile. */
  name?: string;
  /** harness.yaml metadata.description for the synthesized profile. */
  description?: string;
}

/**
 * Run detect() -> importConfig() for every registered adapter that declares
 * one, collecting per-adapter results. Adapters without an importConfig
 * (none, this WP — all four register one) are skipped entirely rather than
 * reported as "detected: false" with no data, since "no import capability"
 * and "nothing found" are different facts.
 */
async function collectAdapterResults(ctx: AdapterContext): Promise<AdapterImportResult[]> {
  const results: AdapterImportResult[] = [];

  for (const adapter of getAllAdapters()) {
    if (!adapter.importConfig) continue;

    const detectResult = await adapter.detect(ctx);
    const fragments = await adapter.importConfig(ctx);

    const warnings: string[] = [];
    for (const fragment of fragments) {
      warnings.push(...fragment.warnings);
    }

    results.push({
      adapter: adapter.id,
      detected: detectResult !== null,
      fragments,
      warnings,
    });
  }

  return results;
}

/**
 * Top-level reverse-import entry point: scan every registered adapter's
 * native configs in the current project, synthesize one schema-valid
 * harness.yaml, and return it alongside findings + provenance.
 *
 * This is the Node-agnostic core — it only touches the filesystem through
 * the supplied FsProvider, so it is safe to call from the browser/desktop
 * side as well as the CLI (see ../node.ts for a convenience Node wrapper).
 */
export async function importProject(ctx: ImportContext): Promise<ImportProjectResult> {
  const cwd = ctx.fs.cwd();
  const homeRoot = await ctx.fs.homedir();

  const adapterCtx: AdapterContext = {
    fs: ctx.fs,
    projectRoot: cwd,
    homeRoot,
  };

  const results = await collectAdapterResults(adapterCtx);

  const { config, findings, provenance } = synthesize(results, {
    name: ctx.name ?? "imported",
    description: ctx.description ?? "Synthesized from existing tool configurations by harness-kit import.",
  });

  const harnessYaml = serializeHarnessYaml(config);

  return {
    harnessYaml,
    harnessConfig: config,
    findings,
    provenance,
  };
}

/** Alias — some callers think in terms of "the machine" (desktop) rather than "a project" (CLI). Same behavior. */
export const importMachine = importProject;

/**
 * Deterministic YAML serialization: stable key order so import is
 * byte-identical across repeated runs on unchanged inputs (required by the
 * round-trip fixpoint tests). The `yaml` library's default stringify does
 * not reorder object keys, so as long as `synthesize()` always builds
 * `HarnessConfig` with the same key insertion order (it does — see
 * synthesize.ts), this is deterministic without extra sorting.
 */
function serializeHarnessYaml(config: HarnessConfig): string {
  return stringifyYaml(config, { lineWidth: 0 });
}

/**
 * Convenience: import + immediately validate the synthesized harness.yaml
 * against the schema. Throws with the same formatted error shape compile()
 * uses if synthesis somehow produced an invalid document — this should
 * never happen in practice (synthesize() only ever emits schema-legal
 * shapes) but is asserted here defensively since AJV validity is a hard
 * requirement of the import contract.
 */
export async function importProjectValidated(ctx: ImportContext): Promise<ImportProjectResult> {
  const result = await importProject(ctx);
  const validation = validateHarness(result.harnessConfig);
  if (!validation.valid) {
    const errMsgs = validation.errors.map((e) => `  ${e.path}: ${e.message}`).join("\n");
    throw new Error(`import synthesized an invalid harness.yaml:\n${errMsgs}`);
  }
  return result;
}
