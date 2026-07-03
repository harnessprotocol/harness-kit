import type { HarnessConfig, HarnessInstructions, HarnessPermissions, McpServer } from "../types.js";
import type { AdapterId } from "../adapters/adapter.js";
import type {
  AdapterImportResult,
  ImportConflict,
  ImportFindings,
  ImportProvenanceMap,
  ImportSource,
} from "./types.js";

/**
 * Deterministic ordering key — mirrors ADAPTERS registry order (registry.ts)
 * rather than object/Map iteration order or discovery order, so two runs
 * over the same unchanged inputs always synthesize byte-identical output
 * regardless of incidental JS iteration-order variance.
 */
const ADAPTER_ORDER: AdapterId[] = ["claude-code", "cursor", "copilot", "opencode", "pi", "agents-md"];

function adapterRank(id: AdapterId): number {
  const idx = ADAPTER_ORDER.indexOf(id);
  return idx === -1 ? ADAPTER_ORDER.length : idx;
}

function stableSortByAdapter<T extends { adapter: AdapterId }>(items: T[]): T[] {
  return [...items].sort((a, b) => adapterRank(a.adapter) - adapterRank(b.adapter));
}

// ── Deep structural equality for conflict detection ──────────────

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  // Filter out explicit-undefined keys before sorting/serializing — an
  // object with `{ a: undefined }` should compare equal to `{}` for our
  // purposes (both mean "this optional field wasn't set"), and JSON.stringify
  // would otherwise emit the bare token `undefined`, which isn't valid JSON
  // and would make two structurally-equivalent values compare unequal.
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

// ── Instructions synthesis ────────────────────────────────────────
//
// Instruction text is opaque prose — never parsed, never paraphrased. When
// multiple adapters/files contribute blocks for the same slot, each distinct
// (by exact byte content) block is concatenated in adapter-registry order,
// separated by a blank line and preceded by an HTML comment naming its
// source. This is NOT summarization — it is verbatim concatenation with a
// provenance marker, so every input byte is still traceable and present.
// Byte-identical duplicate blocks (e.g. the same CLAUDE.md text imported
// twice across fixpoint cycles) are combined once, not repeated.

interface SlotAccumulator {
  slot: "operational" | "behavioral" | "identity";
  seenText: Set<string>;
  parts: Array<{ text: string; source: ImportSource }>;
}

function synthesizeInstructions(
  results: AdapterImportResult[],
): { instructions: HarnessInstructions | undefined; entries: ImportProvenanceMap["entries"] } {
  const slots: Record<string, SlotAccumulator> = {
    operational: { slot: "operational", seenText: new Set(), parts: [] },
    behavioral: { slot: "behavioral", seenText: new Set(), parts: [] },
    identity: { slot: "identity", seenText: new Set(), parts: [] },
  };

  const ordered = stableSortByAdapter(results);
  const entries: ImportProvenanceMap["entries"] = [];

  for (const result of ordered) {
    for (const fragment of result.fragments) {
      if (!fragment.instructions) continue;
      for (const block of fragment.instructions.blocks) {
        const acc = slots[block.slot];
        if (acc.seenText.has(block.text)) continue; // byte-identical dedupe
        acc.seenText.add(block.text);
        acc.parts.push({ text: block.text, source: block.source });
      }
    }
  }

  const instructions: HarnessInstructions = {};
  let hasAny = false;

  for (const key of ["operational", "behavioral", "identity"] as const) {
    const acc = slots[key];
    if (acc.parts.length === 0) continue;
    hasAny = true;

    const combined =
      acc.parts.length === 1
        ? acc.parts[0].text
        : acc.parts
            .map((p) => `<!-- source: ${p.source.adapter}:${p.source.file} -->\n${p.text}`)
            .join("\n");

    instructions[key] = combined.replace(/\n+$/, "");
    entries.push({ field: `instructions.${key}`, source: acc.parts[0].source });
  }

  return { instructions: hasAny ? instructions : undefined, entries };
}

// ── MCP servers synthesis ─────────────────────────────────────────

function synthesizeMcpServers(results: AdapterImportResult[]): {
  mcpServers: Record<string, McpServer> | undefined;
  entries: ImportProvenanceMap["entries"];
  conflicts: ImportConflict[];
} {
  const ordered = stableSortByAdapter(results);
  const byName = new Map<string, Array<{ adapter: AdapterId; value: McpServer; source: ImportSource }>>();

  for (const result of ordered) {
    for (const fragment of result.fragments) {
      if (!fragment.mcpServers) continue;
      for (const [name, prov] of Object.entries(fragment.mcpServers.servers)) {
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name)!.push({ adapter: result.adapter, value: prov.value, source: prov.source });
      }
    }
  }

  if (byName.size === 0) {
    return { mcpServers: undefined, entries: [], conflicts: [] };
  }

  const mcpServers: Record<string, McpServer> = {};
  const entries: ImportProvenanceMap["entries"] = [];
  const conflicts: ImportConflict[] = [];

  for (const name of [...byName.keys()].sort()) {
    const candidates = byName.get(name)!;
    // Distinct-by-value dedupe: identical configs from different adapters
    // collapse to one, no conflict.
    const distinct: typeof candidates = [];
    for (const c of candidates) {
      if (!distinct.some((d) => deepEqual(d.value, c.value))) distinct.push(c);
    }

    // First-seen (adapter-registry order) wins deterministically as the
    // value placed in mcp-servers — never a silent pick, since the full set
    // of alternates is always recorded in conflicts below when distinct.length > 1.
    mcpServers[name] = distinct[0].value;
    entries.push({ field: `mcp-servers.${name}`, source: distinct[0].source });

    if (distinct.length > 1) {
      conflicts.push({
        field: `mcp-servers.${name}`,
        alternates: distinct.map((d) => ({ adapter: d.adapter, value: d.value, source: d.source })),
      });
    }
  }

  return { mcpServers, entries, conflicts };
}

// ── Permissions synthesis ──────────────────────────────────────────
//
// Union tools.allow/deny/ask and paths.writable across adapters (same
// convention as extends.ts's mergeStringUnion). A tool named in both allow
// (by one adapter) and deny (by another) is a genuine conflict — recorded,
// both lists still keep their entries (no silent drop) and the conflict is
// annotated for the user to resolve.

function unionDedupe(lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const item of list) {
      if (!seen.has(item)) {
        seen.add(item);
        out.push(item);
      }
    }
  }
  return out;
}

function synthesizePermissions(results: AdapterImportResult[]): {
  permissions: HarnessPermissions | undefined;
  entries: ImportProvenanceMap["entries"];
  conflicts: ImportConflict[];
} {
  const ordered = stableSortByAdapter(results);
  const contributions: Array<{ adapter: AdapterId; value: HarnessPermissions; source: ImportSource }> = [];

  for (const result of ordered) {
    for (const fragment of result.fragments) {
      if (!fragment.permissions) continue;
      contributions.push({
        adapter: result.adapter,
        value: fragment.permissions.value.value,
        source: fragment.permissions.value.source,
      });
    }
  }

  if (contributions.length === 0) {
    return { permissions: undefined, entries: [], conflicts: [] };
  }

  const allowLists = contributions.map((c) => c.value.tools?.allow ?? []);
  const denyLists = contributions.map((c) => c.value.tools?.deny ?? []);
  const askLists = contributions.map((c) => c.value.tools?.ask ?? []);
  const writableLists = contributions.map((c) => c.value.paths?.writable ?? []);
  const readonlyLists = contributions.map((c) => c.value.paths?.readonly ?? []);
  const hostLists = contributions.map((c) => c.value.network?.["allowed-hosts"] ?? []);

  const allow = unionDedupe(allowLists);
  const deny = unionDedupe(denyLists);
  const ask = unionDedupe(askLists);
  const writable = unionDedupe(writableLists);
  const readonly = unionDedupe(readonlyLists);
  const allowedHosts = unionDedupe(hostLists);

  const permissions: HarnessPermissions = {};
  if (allow.length || deny.length || ask.length) {
    permissions.tools = {
      ...(allow.length ? { allow } : {}),
      ...(deny.length ? { deny } : {}),
      ...(ask.length ? { ask } : {}),
    };
  }
  if (writable.length || readonly.length) {
    permissions.paths = {
      ...(writable.length ? { writable } : {}),
      ...(readonly.length ? { readonly } : {}),
    };
  }
  if (allowedHosts.length) {
    permissions.network = { "allowed-hosts": allowedHosts };
  }

  const entries: ImportProvenanceMap["entries"] = [
    { field: "permissions", source: contributions[0].source },
  ];

  const conflicts: ImportConflict[] = [];
  const allowSet = new Set(allow);
  const denySet = new Set(deny);
  const overlap = [...allowSet].filter((t) => denySet.has(t));
  if (overlap.length > 0) {
    conflicts.push({
      field: "permissions.tools",
      alternates: contributions.map((c) => ({
        adapter: c.adapter,
        value: c.value.tools,
        source: c.source,
      })),
    });
  }

  return { permissions: Object.keys(permissions).length > 0 ? permissions : undefined, entries, conflicts };
}

// ── Findings summary ───────────────────────────────────────────────

function buildFindings(results: AdapterImportResult[]): ImportFindings {
  const ordered = stableSortByAdapter(results);
  return {
    adapters: ordered.map((result) => {
      const found: Array<{ domain: string; file: string; detail: string }> = [];
      const skipped: Array<{ file: string; reason: string }> = [];

      for (const fragment of result.fragments) {
        if (fragment.instructions) {
          for (const block of fragment.instructions.blocks) {
            found.push({
              domain: "instructions",
              file: block.source.file,
              detail: `${block.slot} instruction block (${block.text.length} chars)`,
            });
          }
        }
        if (fragment.mcpServers) {
          for (const [name, prov] of Object.entries(fragment.mcpServers.servers)) {
            found.push({
              domain: "mcp",
              file: prov.source.file,
              detail: `mcp server '${name}' (${prov.value.transport})`,
            });
          }
        }
        if (fragment.permissions) {
          found.push({
            domain: "permissions",
            file: fragment.permissions.value.source.file,
            detail: "tool/path/network permissions",
          });
        }
        if (fragment.skills) {
          for (const skill of fragment.skills.skills) {
            found.push({
              domain: "skills",
              file: skill.path,
              detail: `skill '${skill.name}' (deployed, not imported into plugins — reference only)`,
            });
          }
        }
        if (fragment.skipped) {
          skipped.push(...fragment.skipped);
        }
      }

      return {
        adapter: result.adapter,
        detected: result.detected,
        found,
        skipped,
        warnings: result.warnings,
      };
    }),
  };
}

// ── Top-level synthesize ────────────────────────────────────────────

export interface SynthesizeResult {
  config: HarnessConfig;
  findings: ImportFindings;
  provenance: ImportProvenanceMap;
}

/**
 * Merge N adapters' ImportedFragments into ONE schema-valid harness.yaml
 * config. Identical values dedupe; conflicting values become annotated
 * alternates under the `x-harness-import` extension key (schema explicitly
 * allows `x-*` patternProperties — see harness.schema.json) rather than a
 * silent pick. A per-adapter findings summary is always produced for the
 * CLI/desktop to render, independent of whether synthesis found any
 * conflicts.
 *
 * `name`/`description` are supplied by the caller (importProject) since
 * there is no native-tool artifact these can be reliably derived from.
 */
export function synthesize(
  results: AdapterImportResult[],
  meta: { name: string; description: string },
): SynthesizeResult {
  const { instructions, entries: instrEntries } = synthesizeInstructions(results);
  const { mcpServers, entries: mcpEntries, conflicts: mcpConflicts } = synthesizeMcpServers(results);
  const { permissions, entries: permEntries, conflicts: permConflicts } = synthesizePermissions(results);

  const config: HarnessConfig = {
    version: "1",
    metadata: { name: meta.name, description: meta.description },
    ...(instructions ? { instructions } : {}),
    ...(mcpServers ? { "mcp-servers": mcpServers } : {}),
    ...(permissions ? { permissions } : {}),
  };

  const allConflicts = [...mcpConflicts, ...permConflicts];
  if (allConflicts.length > 0) {
    (config as unknown as Record<string, unknown>)["x-harness-import"] = {
      conflicts: allConflicts.map((c) => ({
        field: c.field,
        alternates: c.alternates.map((alt) => ({
          adapter: alt.adapter,
          value: alt.value,
          source: `${alt.source.adapter}:${alt.source.file}`,
        })),
      })),
    };
  }

  const findings = buildFindings(results);

  const provenance: ImportProvenanceMap = {
    entries: [...instrEntries, ...mcpEntries, ...permEntries],
    conflicts: allConflicts,
  };

  return { config, findings, provenance };
}
