import type { FsProvider } from "../fs-provider.js";
import type {
  EnvDeclaration,
  HarnessConfig,
  HarnessInstructions,
  HarnessPermissions,
  HarnessPlugin,
  McpServer,
} from "../types.js";
import { parseHarness } from "../parser/parse-harness.js";
import { validateHarness } from "../schema/validate.js";

// ── Constants ─────────────────────────────────────────────────

const MAX_DEPTH = 5;

// ── Internal merge helpers ────────────────────────────────────

/**
 * Merge two records by key — overlay wins on conflict.
 */
function mergeByKey<T>(
  base: Record<string, T> | undefined,
  overlay: Record<string, T> | undefined,
): Record<string, T> | undefined {
  if (!base && !overlay) return undefined;
  return { ...(base ?? {}), ...(overlay ?? {}) };
}

/**
 * Merge two arrays deduplicating by a string key — overlay entries win on conflict.
 * Items from base that share a key with an overlay item are dropped.
 */
function mergeByName<T extends { name: string }>(
  base: T[] | undefined,
  overlay: T[] | undefined,
): T[] | undefined {
  if (!base && !overlay) return undefined;
  const baseItems = base ?? [];
  const overlayItems = overlay ?? [];
  const overlayNames = new Set(overlayItems.map((i) => i.name));
  const filtered = baseItems.filter((i) => !overlayNames.has(i.name));
  const merged = [...filtered, ...overlayItems];
  return merged.length > 0 ? merged : undefined;
}

/**
 * Merge env declarations — dedup by name, overlay wins on conflict.
 */
function mergeEnv(
  base: EnvDeclaration[] | undefined,
  overlay: EnvDeclaration[] | undefined,
): EnvDeclaration[] | undefined {
  return mergeByName(base, overlay);
}

/**
 * Merge plugins — dedup by name, overlay wins on conflict.
 */
function mergePlugins(
  base: HarnessPlugin[] | undefined,
  overlay: HarnessPlugin[] | undefined,
): HarnessPlugin[] | undefined {
  return mergeByName(base, overlay);
}

/**
 * Normalize instructions to the structured form for internal processing.
 * A plain string is treated as operational text with no import-mode set.
 */
function normalizeInstructions(
  raw: HarnessInstructions | string | undefined,
): HarnessInstructions | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "string") {
    return { operational: raw };
  }
  return raw;
}

/**
 * Merge instructions where base is the accumulated parent and overlay is the child.
 * The overlay's import-mode governs how the two are combined.
 */
function mergeInstructions(
  base: HarnessInstructions | string | undefined,
  overlay: HarnessInstructions | string | undefined,
): HarnessInstructions | string | undefined {
  const normalBase = normalizeInstructions(base);
  const normalOverlay = normalizeInstructions(overlay);

  if (!normalBase && !normalOverlay) return undefined;
  if (!normalOverlay) return base; // no child instructions — pass parent through
  if (!normalBase) return overlay; // no parent instructions — child as-is

  const importMode = normalOverlay["import-mode"] ?? "merge";

  if (importMode === "replace") {
    // Child replaces parent entirely — return child as-is
    return overlay;
  }

  if (importMode === "skip") {
    // Parent passes through, child adds nothing
    return base;
  }

  // merge (default): prepend parent text before child text for each slot
  const mergeSlot = (
    parentText: string | null | undefined,
    childText: string | null | undefined,
  ): string | null | undefined => {
    if (!parentText && !childText) return undefined;
    if (!parentText) return childText;
    if (!childText) return parentText;
    return `${parentText}\n\n${childText}`;
  };

  const merged: HarnessInstructions = {
    operational: mergeSlot(normalBase.operational, normalOverlay.operational) as
      | string
      | null
      | undefined,
    behavioral: mergeSlot(normalBase.behavioral, normalOverlay.behavioral) as
      | string
      | null
      | undefined,
    identity: mergeSlot(normalBase.identity, normalOverlay.identity) as
      | string
      | null
      | undefined,
  };

  // Preserve import-mode from overlay if set (so downstream passes it along)
  if (normalOverlay["import-mode"]) {
    merged["import-mode"] = normalOverlay["import-mode"];
  }

  // Strip undefined keys for a clean object
  if (merged.operational === undefined) delete merged.operational;
  if (merged.behavioral === undefined) delete merged.behavioral;
  if (merged.identity === undefined) delete merged.identity;

  return merged;
}

/**
 * Merge string arrays as a union (no duplicates), overlay additions appended.
 */
function mergeStringUnion(
  base: string[] | undefined,
  overlay: string[] | undefined,
): string[] | undefined {
  if (!base && !overlay) return undefined;
  const merged = [...(base ?? [])];
  for (const item of overlay ?? []) {
    if (!merged.includes(item)) merged.push(item);
  }
  return merged.length > 0 ? merged : undefined;
}

/**
 * Merge string arrays as an intersection (only items present in both).
 * If only one side defines the list, that list is used unchanged.
 */
function mergeStringIntersection(
  base: string[] | undefined,
  overlay: string[] | undefined,
): string[] | undefined {
  if (!base && !overlay) return undefined;
  if (!base) return overlay;
  if (!overlay) return base;
  const result = base.filter((item) => overlay.includes(item));
  return result.length > 0 ? result : undefined;
}

/**
 * Merge permissions according to protocol rules:
 * - tools.allow: intersection when both define it; single side wins otherwise
 * - tools.deny: union
 * - tools.ask: union
 * - paths.writable: union
 * - paths.readonly: union
 * - network.allowed-hosts: union
 */
function mergePermissions(
  base: HarnessPermissions | undefined,
  overlay: HarnessPermissions | undefined,
): HarnessPermissions | undefined {
  if (!base && !overlay) return undefined;

  const mergedTools: HarnessPermissions["tools"] = {};
  const baseTools = base?.tools;
  const overlayTools = overlay?.tools;

  const allow = mergeStringIntersection(baseTools?.allow, overlayTools?.allow);
  const deny = mergeStringUnion(baseTools?.deny, overlayTools?.deny);
  const ask = mergeStringUnion(baseTools?.ask, overlayTools?.ask);

  if (allow !== undefined) mergedTools.allow = allow;
  if (deny !== undefined) mergedTools.deny = deny;
  if (ask !== undefined) mergedTools.ask = ask;

  const mergedPaths: HarnessPermissions["paths"] = {};
  const basePaths = base?.paths;
  const overlayPaths = overlay?.paths;

  const writable = mergeStringUnion(basePaths?.writable, overlayPaths?.writable);
  const readonly = mergeStringUnion(basePaths?.readonly, overlayPaths?.readonly);

  if (writable !== undefined) mergedPaths.writable = writable;
  if (readonly !== undefined) mergedPaths.readonly = readonly;

  const mergedNetwork: HarnessPermissions["network"] = {};
  const baseNetwork = base?.network;
  const overlayNetwork = overlay?.network;

  const allowedHosts = mergeStringUnion(
    baseNetwork?.["allowed-hosts"],
    overlayNetwork?.["allowed-hosts"],
  );
  if (allowedHosts !== undefined) mergedNetwork["allowed-hosts"] = allowedHosts;

  const permissions: HarnessPermissions = {};
  if (Object.keys(mergedTools).length > 0) permissions.tools = mergedTools;
  if (Object.keys(mergedPaths).length > 0) permissions.paths = mergedPaths;
  if (Object.keys(mergedNetwork).length > 0) permissions.network = mergedNetwork;

  return Object.keys(permissions).length > 0 ? permissions : undefined;
}

/**
 * Merge two HarnessConfigs where base is lower priority (parent) and
 * overlay is higher priority (child). Returns a new merged config.
 * Metadata and kind are always taken from overlay (child).
 * The extends field is preserved from the overlay as-is.
 *
 * policy is intentionally not merged (out of scope for Phase 1b).
 */
function mergeSections(
  base: HarnessConfig,
  overlay: HarnessConfig,
): HarnessConfig {
  const mergedMcpServers = mergeByKey<McpServer>(
    base["mcp-servers"],
    overlay["mcp-servers"],
  );
  const mergedEnv = mergeEnv(base.env, overlay.env);
  const mergedPlugins = mergePlugins(base.plugins, overlay.plugins);

  // For skills we need to handle HarnessPlugin[] type (same shape as plugins — has .name)
  // HarnessConfig.plugins covers both; there's no separate "skills" array in types.ts.
  // The task description mentions skills — checking if they mean plugins only.

  const mergedInstructions = mergeInstructions(
    base.instructions,
    overlay.instructions,
  );
  const mergedPermissions = mergePermissions(
    base.permissions,
    overlay.permissions,
  );

  const result: HarnessConfig = {
    // Structural fields from overlay (child wins)
    version: overlay.version,
    ...(overlay.kind !== undefined ? { kind: overlay.kind } : {}),
    ...(overlay.metadata !== undefined ? { metadata: overlay.metadata } : {}),
    ...(overlay.$schema !== undefined ? { $schema: overlay.$schema } : {}),
    // Merged sections
    ...(mergedMcpServers !== undefined
      ? { "mcp-servers": mergedMcpServers }
      : {}),
    ...(mergedEnv !== undefined ? { env: mergedEnv } : {}),
    ...(mergedPlugins !== undefined ? { plugins: mergedPlugins } : {}),
    ...(mergedInstructions !== undefined
      ? { instructions: mergedInstructions as HarnessInstructions }
      : {}),
    ...(mergedPermissions !== undefined ? { permissions: mergedPermissions } : {}),
    // Preserve extends from child so the field remains in compiled output
    ...(overlay.extends !== undefined ? { extends: overlay.extends } : {}),
  };

  return result;
}

// ── Resolve path for a local extends source ───────────────────

function resolveLocalSource(
  source: string,
  cwd: string,
  joinPath: (...segments: string[]) => string,
): string {
  const rel = source.startsWith("./") ? source.slice(2) : source;
  return joinPath(cwd, rel);
}

// ── Core recursive resolver ───────────────────────────────────

async function resolveExtendsInner(
  config: HarnessConfig,
  fs: FsProvider,
  cwd: string,
  visited: Set<string>,
  depth: number,
): Promise<HarnessConfig> {
  if (!config.extends || config.extends.length === 0) {
    return config;
  }

  if (depth > MAX_DEPTH) {
    throw new Error(
      `resolveExtends: maximum inheritance depth of ${MAX_DEPTH} exceeded. ` +
        `Check for deeply nested extends chains.`,
    );
  }

  // Resolve all parents left-to-right, then merge them in order
  let accumulated: HarnessConfig | null = null;

  for (const entry of config.extends) {
    const { source } = entry;

    // Skip remote sources with a warning
    if (!source.startsWith("./") && !source.startsWith("../")) {
      console.warn(
        `resolveExtends: skipping remote source "${source}" — only local sources (starting with "./" or "../") are supported in Phase 1b.`,
      );
      continue;
    }

    const absPath = resolveLocalSource(source, cwd, fs.joinPath.bind(fs));

    // Cycle detection
    if (visited.has(absPath)) {
      const chain = [...visited, absPath].join(" → ");
      throw new Error(
        `resolveExtends: circular extends detected: ${chain}`,
      );
    }

    // Existence check
    const fileExists = await fs.exists(absPath);
    if (!fileExists) {
      throw new Error(
        `resolveExtends: fragment file not found: ${absPath}`,
      );
    }

    // Parse
    const raw = await fs.readFile(absPath);
    const { config: parentConfig } = parseHarness(raw);

    // Validate
    const validation = validateHarness(parentConfig);
    if (!validation.valid) {
      const errorSummary = validation.errors
        .map((e) => `  ${e.path}: ${e.message}`)
        .join("\n");
      throw new Error(
        `resolveExtends: validation failed for fragment "${absPath}":\n${errorSummary}`,
      );
    }

    // Compute parent cwd (directory of the fragment file)
    const parentCwd = fs.dirname(absPath);

    // Recurse into parent's own extends
    const nextVisited = new Set(visited);
    nextVisited.add(absPath);
    const resolvedParent = await resolveExtendsInner(
      parentConfig,
      fs,
      parentCwd,
      nextVisited,
      depth + 1,
    );

    // Merge: accumulated is base (lower priority), resolvedParent is overlay (higher priority
    // because later entries win over earlier ones, so we accumulate left-to-right where
    // each new parent overlays the prior accumulation)
    if (accumulated === null) {
      accumulated = resolvedParent;
    } else {
      accumulated = mergeSections(accumulated, resolvedParent);
    }
  }

  if (accumulated === null) {
    // All entries were remote and skipped
    return config;
  }

  // Child (config) wins over all parents
  return mergeSections(accumulated, config);
}

// ── Public API ────────────────────────────────────────────────

/**
 * Resolve the `extends` field in a HarnessConfig by reading, parsing, and
 * merging all referenced fragment files into the config.
 *
 * Only local sources (starting with "./" or "../") are resolved.
 * Remote sources are skipped with a warning.
 *
 * @param config  The parsed harness config whose extends entries should be resolved.
 * @param fs      Filesystem provider — only FsProvider methods are used.
 * @param cwd     The directory from which relative source paths are resolved.
 * @returns       A new HarnessConfig with all local parents merged in. The original
 *                config.extends field is preserved in the returned object.
 * @throws        If a cycle is detected, max depth is exceeded, a referenced file
 *                does not exist, or a fragment fails schema validation.
 */
export async function resolveExtends(
  config: HarnessConfig,
  fs: FsProvider,
  cwd: string,
): Promise<HarnessConfig> {
  const visited = new Set<string>();
  return resolveExtendsInner(config, fs, cwd, visited, 0);
}
