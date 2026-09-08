import type { FsProvider } from "../fs-provider.js";
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
      if (options.sourceSurface === undefined) {
        return {
          status: "refused",
          reason: "unpacking needs a source surface to copy the plugin's contents from.",
        };
      }
      const source = await resolvePluginRoot(options, request);
      if (source === null) {
        return {
          status: "refused",
          reason: `HarnessKit could not find ${request.identity}'s files on this machine to copy from.`,
        };
      }
      const root = request.scope === "user" ? options.homeRoot : (request.projectRoot ?? undefined);
      if (root === undefined || root === null) {
        return { status: "refused", reason: `no ${request.scope} root to unpack into.` };
      }
      const destination = options.fs.joinPath(root, store.path, pluginName);
      const written = await copySkills(options.fs, source, destination);
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
      };
    },
  };
}

/**
 * Locate the plugin's own directory on disk. Claude Code caches every install
 * under `~/.claude/plugins/cache/<marketplace>/<name>/<version>`; that cache
 * is the only copy of a plugin's contents on the machine, so it is what an
 * unpack reads from.
 */
async function resolvePluginRoot(
  options: ExecuteOptions,
  request: PluginBrokerRequest,
): Promise<string | null> {
  const home = options.homeRoot;
  if (home === undefined) return null;
  const at = request.identity.lastIndexOf("@");
  if (at <= 0) return null;
  const name = request.identity.slice(0, at);
  const marketplace = request.identity.slice(at + 1);
  if (!isSafeSegment(name) || !isSafeSegment(marketplace)) return null;

  const base = options.fs.joinPath(home, ".claude", "plugins", "cache", marketplace, name);
  if (!(await options.fs.isDirectory(base))) return null;
  const versions = await options.fs.readDir(base);
  // Numeric-segment ordering, NOT lexical: "0.10.0" sorts before "0.9.0" as a
  // string, so a lexical pick silently unpacks an older release whose skill
  // SET differs — skills the current version added would be missing and ones
  // it removed would be installed.
  const chosen = [...versions].sort(compareVersions).pop();
  if (chosen === undefined || !isSafeSegment(chosen)) return null;
  return options.fs.joinPath(base, chosen);
}

/** Copy every SKILL.md tree from the plugin into the destination. */
async function copySkills(
  fs: FsProvider,
  pluginRoot: string,
  destination: string,
): Promise<string[]> {
  const written: string[] = [];
  for (const directory of PLUGIN_SKILL_DIRS) {
    const source = fs.joinPath(pluginRoot, directory);
    if (!(await fs.isDirectory(source))) continue;
    for (const entry of await fs.readDir(source)) {
      if (!isSafeSegment(entry)) continue;
      const skillFile = fs.joinPath(source, entry, "SKILL.md");
      if (!(await fs.exists(skillFile))) continue;
      const content = await fs.readFile(skillFile);
      const target = fs.joinPath(destination, entry, "SKILL.md");
      await fs.mkdir(fs.dirname(target), { recursive: true });
      await fs.writeFile(target, content);
      written.push(target);
    }
  }
  return written;
}

/**
 * Order two cache directory names by their numeric segments, falling back to
 * a string compare for anything non-numeric (pre-release tags, or a directory
 * that is not a version at all). Enough to pick the newest of the versions a
 * plugin cache actually holds; not a full semver implementation, and it does
 * not need to be.
 */
function compareVersions(left: string, right: string): number {
  const parts = (value: string): Array<number | string> =>
    value.split(/[.-]/).map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment));
  const a = parts(left);
  const b = parts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const x = a[index];
    const y = b[index];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (typeof x === "number" && typeof y === "number") {
      if (x !== y) return x - y;
    } else if (String(x) !== String(y)) {
      return String(x) < String(y) ? -1 : 1;
    }
  }
  return 0;
}
