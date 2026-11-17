import type { FsProvider } from "../fs-provider.js";
import { assertNoSymlinkBoundary } from "../portability/transaction.js";
import type { SurfaceDescriptor } from "../surfaces/types.js";
import type { PluginBrokerRequest, ExecuteOptions, PluginActionOutcome } from "./broker.js";

/**
 * Unpack driver (AC-19): place a plugin's CONTENTS into a surface that has no
 * plugin model of its own (pi, opencode).
 *
 * The plugin stays a unit only in HarnessKit's records — pi has no notion of
 * one, so what lands there is skills in the surface's skills directory, and
 * nothing else pretends otherwise. Every written path is recorded so uninstall
 * can remove exactly what was added and no more, which is the whole reason
 * AC-19 asks for tracking rather than a plain copy.
 *
 * There is no backup or rollback: a file written here is not restorable. For
 * that reason unpack never overwrites; it refuses when any target exists.
 * Each file is written to a temp name and renamed into place.
 *
 * Deliberately NARROW this milestone: skills only. A plugin's MCP servers and
 * instructions would each need their own merge semantics against a file the
 * user also writes, and getting that wrong means clobbering their config. The
 * refusal below says so out loud rather than half-doing it.
 */

export type UnpackPlan =
  | {
      supported: true;
      /** Directory the plugin's contents will be written under. */
      targetDirectory: string;
      description: string;
      execute(options: ExecuteOptions): Promise<PluginActionOutcome>;
    }
  | { supported: false; reason: string };

/** Skill directories inside a plugin, in the order the ecosystem uses them. */
const PLUGIN_SKILL_DIRS = ["skills"] as const;

function isSafeSegment(name: string): boolean {
  return (
    name.length > 0 &&
    !name.includes("/") &&
    !name.includes("\\") &&
    name !== "." &&
    name !== ".."
  );
}

/**
 * Plan an unpack. The plan closes over the request; the IO happens in
 * `execute` so callers can show what WOULD happen (`--dry-run`, the drawer)
 * without touching the filesystem.
 */
export function planUnpackAction(
  descriptor: SurfaceDescriptor,
  request: PluginBrokerRequest,
): UnpackPlan {
  const store = descriptor.stores.find(
    (candidate) => candidate.kind === "skill" && candidate.scope === request.scope,
  );
  if (store === undefined) {
    return {
      supported: false,
      reason: `${descriptor.label} has no ${request.scope}-scope skills directory to unpack a plugin into.`,
    };
  }
  const at = request.identity.lastIndexOf("@");
  const pluginName = at > 0 ? request.identity.slice(0, at) : request.identity;
  if (!isSafeSegment(pluginName)) {
    return {
      supported: false,
      reason: `'${pluginName}' is not a usable directory name, so its contents cannot be unpacked safely.`,
    };
  }

  return {
    supported: true,
    targetDirectory: store.path,
    description:
      request.action === "install"
        ? `unpack ${request.identity}'s skills into ${descriptor.label}'s ${request.scope} skills directory (${store.path})`
        : `remove the files HarnessKit unpacked for ${request.identity} from ${descriptor.label}`,
    async execute(options: ExecuteOptions): Promise<PluginActionOutcome> {
      if (request.action === "uninstall") {
        return {
          status: "refused",
          reason:
            "removing an unpacked plugin needs the file list HarnessKit recorded when it was installed; " +
            "that record is written by this milestone but not yet read back.",
        };
      }
      let skills: Array<{ dir: string; content: string }>;
      const root = request.scope === "user" ? options.homeRoot : (request.projectRoot ?? undefined);
      if (options.catalogSkills === undefined) {
        // Only Claude Code's cache holds unpacked plugin contents on disk, and
        // `resolvePluginRoot` reads exactly that. Accepting any other source and
        // silently shipping Claude Code's bytes under its name would be worse
        // than refusing: the user picked a surface and would get another
        // vendor's files.
        if (options.sourceSurface !== "claude-code") {
          return {
            status: "refused",
            reason:
              options.sourceSurface === undefined
                ? "unpacking needs a source surface to copy the plugin's contents from."
                : `only claude-code caches plugin contents on disk; HarnessKit cannot unpack from ${options.sourceSurface}.`,
          };
        }
        const source = await resolvePluginRoot(options, request);
        if (source === null) {
          return {
            status: "refused",
            reason: `HarnessKit could not find ${request.identity}'s files on this machine to copy from.`,
          };
        }
        skills = await readCachedSkills(options.fs, source);
      } else {
        skills = options.catalogSkills.filter((skill) => isSafeSegment(skill.dir)).map((s) => ({ ...s }));
      }
      if (root === undefined || root === null) {
        return { status: "refused", reason: `no ${request.scope} root to unpack into.` };
      }
      const destination = options.fs.joinPath(root, store.path, pluginName);
      let written: string[];
      try {
        written = await writeSkills(options.fs, root, destination, skills, options.now);
      } catch (error) {
        if (error instanceof UnpackRefused) return { status: "refused", reason: error.message };
        // The contract is "never throws for an ordinary failure". A refusal or
        // an IO error mid-copy is ordinary.
        const message = error instanceof Error ? error.message : String(error);
        const partial = error instanceof UnpackWriteFailed ? error.files : [];
        return {
          status: "failed",
          reason: `unpacking ${request.identity} stopped: ${message}`,
          ...(partial.length > 0 ? { files: partial } : {}),
        };
      }
      if (written.length === 0) {
        return {
          status: "refused",
          reason: `${request.identity} has no skills to unpack — its other contents (MCP servers, instructions) are not unpacked this milestone.`,
        };
      }
      return {
        status: "installed",
        display: `unpack ${request.identity} → ${store.path}/${pluginName}`,
        files: written,
        details: { note: SKILL_ONLY_NOTE },
      };
    },
  };
}

/**
 * Locate the plugin's own directory on disk.
 *
 * Uses the path the surface RECORDED (`installPath` on the install entry),
 * never a guess. Two attempts at inferring it from the cache's directory
 * names were both wrong — lexically (`0.9.0` beat `0.10.0`) and then for
 * prereleases — and neither could ever work for the several plugins on a real
 * machine that cache by commit SHA, where no ordering of names is meaningful.
 * When the record is absent there is no honest answer, so this refuses rather
 * than picking one.
 */
async function resolvePluginRoot(
  options: ExecuteOptions,
  request: PluginBrokerRequest,
): Promise<string | null> {
  const home = options.homeRoot;
  if (home === undefined) return null;
  const recorded = request.sourcePath;
  if (recorded === undefined) return null;
  // The recorded path is data from another tool's file: keep it inside the
  // cache root rather than trusting it to be somewhere sensible.
  const cacheRoot = options.fs.joinPath(home, ".claude", "plugins", "cache");
  const prefix = cacheRoot.endsWith("/") ? cacheRoot : `${cacheRoot}/`;
  if (!recorded.startsWith(prefix) || recorded.includes("..")) return null;
  if (!(await options.fs.isDirectory(recorded))) return null;
  return recorded;
}

/** Read every SKILL.md from the plugin's skills directories. */
async function readCachedSkills(
  fs: FsProvider,
  pluginRoot: string,
): Promise<Array<{ dir: string; content: string }>> {
  const skills: Array<{ dir: string; content: string }> = [];
  for (const directory of PLUGIN_SKILL_DIRS) {
    const source = fs.joinPath(pluginRoot, directory);
    if (!(await fs.isDirectory(source))) continue;
    for (const entry of await fs.readDir(source)) {
      if (!isSafeSegment(entry)) continue;
      const skillFile = fs.joinPath(source, entry, "SKILL.md");
      if (!(await fs.exists(skillFile))) continue;
      skills.push({ dir: entry, content: await fs.readFile(skillFile) });
    }
  }
  return skills;
}

/**
 * Write each skill's SKILL.md under the destination.
 *
 * Two passes. The first computes every target and refuses if ANY already
 * exists: unpack never overwrites, because it has no backup to restore from.
 * Nothing is written until every target is known to be free, so a refusal
 * leaves the disk untouched. The second writes `<target>.harness-tmp-<suffix>`
 * and renames it onto the target, the only write shape the desktop's guarded
 * Rust commands accept.
 *
 * `root` anchors the symlink check. Validating the plugin name and each skill
 * entry as safe segments stops traversal through the NAMES; it says nothing
 * about the destination directory itself, and a single symlink planted inside
 * a skills tree would otherwise redirect these writes to any path the user
 * can reach.
 */
async function writeSkills(
  fs: FsProvider,
  root: string,
  destination: string,
  skills: ReadonlyArray<{ dir: string; content: string }>,
  now: string,
): Promise<string[]> {
  const prefix = root.endsWith("/") ? root : `${root}/`;
  const stamp = now.replace(/[^A-Za-z0-9-]/g, "-");
  const targets = skills.map((skill) => ({
    target: fs.joinPath(destination, skill.dir, "SKILL.md"),
    content: skill.content,
  }));
  const seen = new Set<string>();
  for (const { target } of targets) {
    if (seen.has(target)) {
      throw new UnpackRefused(`${target} appears more than once in the plugin's skills; HarnessKit does not overwrite.`);
    }
    seen.add(target);
    if (!target.startsWith(prefix)) {
      throw new UnpackRefused(`refusing to write outside ${root}: ${target}`);
    }
    if (await fs.exists(target)) {
      throw new UnpackRefused(
        `${target} already exists; HarnessKit does not overwrite a skill it did not write. Move or remove it first.`,
      );
    }
  }
  const written: string[] = [];
  let index = 0;
  for (const { target, content } of targets) {
    // Checked per file, AFTER any mkdir a previous iteration performed, so
    // a symlink appearing mid-run is caught rather than followed.
    const temp = `${target}.harness-tmp-${stamp}-${index}`;
    index += 1;
    try {
      await assertNoSymlinkBoundary(fs, root, target.slice(prefix.length));
      await fs.mkdir(fs.dirname(target), { recursive: true });
      await fs.writeFile(temp, content);
      await fs.renameFile(temp, target);
    } catch (error) {
      // Best effort: do not leave the temp file behind. Its own failure is
      // ignored so the original error is the one reported.
      try {
        await fs.removeFile?.(temp);
      } catch {
        /* ignore */
      }
      throw new UnpackWriteFailed(error instanceof Error ? error.message : String(error), written);
    }
    written.push(target);
  }
  return written;
}

const SKILL_ONLY_NOTE =
  "Only SKILL.md files were written; a skill's other files (scripts, references) were not copied.";

/** SKILL.md text for a catalog skill: JSON-quoted frontmatter values, then the body. */
export function catalogSkillContent(skill: {
  name: string;
  description: string;
  body: string;
}): string {
  return `---\nname: ${JSON.stringify(skill.name)}\ndescription: ${JSON.stringify(skill.description)}\n---\n\n${skill.body}`;
}

/** An IO failure mid-write, carrying the files already placed. */
class UnpackWriteFailed extends Error {
  constructor(
    message: string,
    readonly files: string[],
  ) {
    super(message);
    this.name = "UnpackWriteFailed";
  }
}

/** A refusal the driver reports rather than throwing out of the broker. */
export class UnpackRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnpackRefused";
  }
}
