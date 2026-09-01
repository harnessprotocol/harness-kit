import type { FsProvider } from "../fs-provider.js";
import { TARGETS } from "../adapters/target-metadata.js";
import type { CompileSurfaceId, HarnessVendorConfig, SurfaceId } from "../types.js";
import { computeFileHash } from "../compile/check.js";
import { redactInventoryConfig } from "./inventory.js";
import { digestValue } from "./resource-model.js";
import type { ReleaseDigest } from "./types.js";

export interface NativeExtensionFile {
  path: string;
  content: string;
  digest: ReleaseDigest;
}

export interface NativeExtensionSetting {
  path: string;
  format: "json";
  value: Record<string, unknown>;
  digest: ReleaseDigest;
}

export interface NativeExtensionBlock {
  files?: NativeExtensionFile[];
  settings?: NativeExtensionSetting[];
  omitted?: Array<{ path: string; reason: string }>;
}

// Exhaustive over CompileSurfaceId — extending COMPILE_SURFACE_IDS without an
// entry here fails to compile.
const RESOURCE_DIRECTORIES: Record<CompileSurfaceId, string[]> = {
  "claude-code": [".claude/agents", ".claude/commands", ".claude/hooks"],
  cursor: [".cursor/agents", ".cursor/commands", ".cursor/hooks"],
  "copilot-vscode": [".github/agents", ".github/prompts"],
  codex: [".codex/agents", ".codex/commands", ".codex/config.toml"],
  opencode: [".opencode/agent", ".opencode/command", ".opencode/plugin"],
  windsurf: [".windsurf/agents", ".windsurf/workflows", ".windsurf/hooks"],
  gemini: [".gemini/agents", ".gemini/commands"],
  junie: [".junie/agents", ".junie/commands"],
};

const EXTRA_SETTING_FILES: Partial<Record<SurfaceId, Array<{ path: string; omit: string[] }>>> = {
  "claude-code": [{ path: ".claude/settings.json", omit: ["permissions"] }],
  opencode: [{ path: "opencode.json", omit: ["$schema", "mcp", "permission"] }],
};

const NORMALIZED_MCP_TARGETS = new Set<SurfaceId>(["claude-code", "cursor", "copilot-vscode", "gemini", "junie"]);

const CREDENTIAL_ASSIGNMENT = /(?:^|[\s,{])["']?(?:authorization|token|auth[-_]?token|api[-_]?key|access[-_]?token|access[-_]?key|client[-_]?secret|password|passwd|private[-_]?key|secret|cookie)["']?\s*[:=]\s*([^\n,}]+)/gim;
const SECRET_REFERENCE = /^(?:\$[A-Za-z_][A-Za-z0-9_]*|\$\{[A-Za-z_][A-Za-z0-9_]*\}|env:[A-Za-z_][A-Za-z0-9_]*|secret:\/\/[^\s]+)$/;

function safeRelative(path: string): boolean {
  return path.length > 0 && !path.startsWith("/") && !path.startsWith("~") && !path.includes("\\") &&
    !path.split("/").some((part) => part === "" || part === "." || part === "..");
}

function containsCredential(content: string): boolean {
  if (/(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bsk-[A-Za-z0-9_-]{16,}|\bAKIA[A-Z0-9]{16}\b|:\/\/[^\s/:]+:[^\s/@]+@)/.test(content)) {
    return true;
  }
  for (const match of content.matchAll(CREDENTIAL_ASSIGNMENT)) {
    const value = match[1].trim().replace(/^["']|["']$/g, "").trim();
    if (value && !SECRET_REFERENCE.test(value)) return true;
  }
  return false;
}

function pruneRedacted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(pruneRedacted).filter((item) => item !== undefined);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const pruned = pruneRedacted(child);
      if (pruned !== undefined) result[key] = pruned;
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }
  return value === "[REDACTED]" ? undefined : value;
}

async function collectFiles(
  fs: FsProvider,
  root: string,
  relative: string,
  files: NativeExtensionFile[],
  omitted: NativeExtensionBlock["omitted"],
): Promise<void> {
  const absolute = fs.joinPath(root, relative);
  if (fs.isSymlink && await fs.isSymlink(absolute)) {
    omitted!.push({ path: relative, reason: "symbolic links are not portable" });
    return;
  }
  if (await fs.isDirectory(absolute)) {
    for (const entry of (await (fs.readDirAll ? fs.readDirAll(absolute) : fs.readDir(absolute))).sort()) {
      await collectFiles(fs, root, `${relative}/${entry}`, files, omitted);
    }
    return;
  }
  if (!(await fs.exists(absolute)) || !safeRelative(relative)) return;
  const content = await fs.readFile(absolute);
  if (content.length > 1024 * 1024) {
    omitted!.push({ path: relative, reason: "file exceeds the 1 MiB native-extension limit" });
    return;
  }
  if (containsCredential(content)) {
    omitted!.push({ path: relative, reason: "credential-shaped content was excluded on-device" });
    return;
  }
  files.push({ path: relative, content, digest: `sha256:${computeFileHash(content)}` });
}

function settingsFor(target: CompileSurfaceId): Array<{ path: string; omit: string[] }> {
  const integration = TARGETS.find((entry) => entry.id === target);
  if (!integration) throw new Error(`Unknown compile target: ${target}`);
  const common = integration.mcpConfigFile && integration.mcpConfigFormat === "json"
    ? [{ path: integration.mcpConfigFile, omit: NORMALIZED_MCP_TARGETS.has(target) ? ["mcpServers"] : [] }]
    : [];
  const configured = [...common, ...(EXTRA_SETTING_FILES[target] ?? [])];
  return [...new Map(configured.map((entry) => [entry.path, entry])).values()];
}

/** Capture only native surfaces that have no normalized protocol field. */
export async function captureNativeExtensions(fs: FsProvider, root = fs.cwd()): Promise<HarnessVendorConfig> {
  const vendor: HarnessVendorConfig = {};
  for (const target of TARGETS.map((entry) => entry.id)) {
    const files: NativeExtensionFile[] = [];
    const settings: NativeExtensionSetting[] = [];
    const omitted: NonNullable<NativeExtensionBlock["omitted"]> = [];
    for (const directory of RESOURCE_DIRECTORIES[target]) {
      if (await fs.exists(fs.joinPath(root, directory))) await collectFiles(fs, root, directory, files, omitted);
    }
    for (const setting of settingsFor(target)) {
      const absolute = fs.joinPath(root, setting.path);
      if (!(await fs.exists(absolute))) continue;
      try {
        const parsed = JSON.parse(await fs.readFile(absolute)) as Record<string, unknown>;
        const unmatched = Object.fromEntries(Object.entries(parsed).filter(([key]) => !setting.omit.includes(key)));
        const { redacted, findings } = redactInventoryConfig(unmatched);
        const value = pruneRedacted(redacted) as Record<string, unknown> | undefined;
        omitted.push(...findings.map((finding) => ({
          path: `${setting.path}:${finding.path}`,
          reason: "credential-shaped native setting was excluded on-device",
        })));
        if (value && Object.keys(value).length > 0) {
          settings.push({ path: setting.path, format: "json", value, digest: digestValue(value) });
        }
      } catch {
        omitted.push({ path: setting.path, reason: "native JSON settings could not be parsed safely" });
      }
    }
    if (files.length || settings.length || omitted.length) {
      vendor[target] = {
        ...(files.length ? { files: files.sort((a, b) => a.path.localeCompare(b.path)) } : {}),
        ...(settings.length ? { settings: settings.sort((a, b) => a.path.localeCompare(b.path)) } : {}),
        ...(omitted.length ? { omitted: omitted.sort((a, b) => a.path.localeCompare(b.path)) } : {}),
      } satisfies NativeExtensionBlock;
    }
  }
  return vendor;
}

export function parseNativeExtensionBlock(value: unknown): NativeExtensionBlock {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const candidate = value as NativeExtensionBlock;
  const files = candidate.files ?? [];
  const aliases = new Set<string>();
  for (const file of files) {
    if (!safeRelative(file.path) || typeof file.content !== "string") {
      throw new Error("native-extension file path or content is invalid");
    }
    if (aliases.has(file.path)) throw new Error(`duplicate native-extension alias for ${file.path}`);
    aliases.add(file.path);
    if (file.digest !== `sha256:${computeFileHash(file.content)}`) {
      throw new Error(`native-extension digest mismatch for ${file.path}`);
    }
  }
  const settings = candidate.settings ?? [];
  for (const setting of settings) {
    if (!safeRelative(setting.path) || setting.format !== "json" || !setting.value || typeof setting.value !== "object") {
      throw new Error("native-extension setting is invalid");
    }
    if (aliases.has(setting.path)) throw new Error(`duplicate native-extension alias for ${setting.path}`);
    aliases.add(setting.path);
    if (setting.digest !== digestValue(setting.value)) {
      throw new Error(`native-extension digest mismatch for ${setting.path}`);
    }
  }
  return {
    ...(files.length ? { files } : {}),
    ...(settings.length ? { settings } : {}),
    ...(candidate.omitted?.length ? { omitted: candidate.omitted } : {}),
  };
}
