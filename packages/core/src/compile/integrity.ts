import type { FsProvider } from "../fs-provider.js";
import type { HarnessConfig } from "../types.js";
import { skillDirectoryDigest } from "../import/read-skills.js";
import { collectCapsuleFiles } from "../portability/capsule.js";
import { computeFileHash } from "./check.js";
import { computeSourceDir } from "./discovery.js";

async function verifyDirectory(
  label: string,
  source: string | undefined,
  expected: string,
  fs: FsProvider,
  cwd: string,
  home: string,
): Promise<void> {
  let directory = source ? computeSourceDir(source, cwd, home, fs.joinPath.bind(fs)) : null;
  if (!directory || !(await fs.exists(directory))) {
    directory = fs.joinPath(home, ".harness", "cache", "resources", expected, "content");
  }
  if (!(await fs.exists(directory)) || !(await fs.isDirectory(directory))) {
    throw new Error(`${label} integrity cannot be verified because pinned source bytes are unavailable`);
  }
  const files = await collectCapsuleFiles(fs, directory);
  const actual = skillDirectoryDigest(files.map((file) => ({
    path: file.path,
    digest: computeFileHash(file.content),
  })));
  if (actual !== expected) throw new Error(`${label} integrity mismatch: expected ${expected}, got ${actual}`);
}

/** Verify policy-required pins and any locally resolvable MCP package bytes before emitting native config. */
export async function verifyHarnessIntegrity(config: HarnessConfig, fs: FsProvider, cwd: string): Promise<void> {
  const required = config.policy?.["require-integrity"] === true;
  for (const plugin of config.plugins ?? []) {
    if (required && !plugin.integrity?.sha256) throw new Error(`plugin '${plugin.name}' requires an integrity pin`);
  }
  for (const skill of (config.skills ?? []).filter((entry) => entry.enabled !== false)) {
    if (required && !skill.integrity?.sha256) throw new Error(`skill '${skill.name}' requires an integrity pin`);
  }
  const home = await fs.homedir();
  for (const [name, server] of Object.entries(config["mcp-servers"] ?? {})) {
    if (server.transport !== "stdio") continue;
    if (required && !server.integrity?.sha256) throw new Error(`MCP server '${name}' requires an integrity pin`);
    if (server.integrity?.sha256) {
      await verifyDirectory(`MCP server '${name}'`, server.source, server.integrity.sha256, fs, cwd, home);
    }
  }
}
