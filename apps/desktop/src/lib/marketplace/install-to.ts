import { catalogSkillContent, executePluginAction, planPluginAction } from "@harness-kit/core";
import type { MarketplacePlugin } from "@harness-kit/marketplace-data";
import type {
  BrokerPlan,
  FsProvider,
  PluginActionOutcome,
  ProcessRunner,
  SurfaceDescriptor,
  SurfaceId,
  SurfaceScope,
} from "@harness-kit/core";

/**
 * "Install to …" for a catalog plugin (spec AC-27).
 *
 * A catalog plugin has no source surface, so the Machine drawer's
 * source-to-target planner does not apply. Core's broker plans a surface's
 * own native installer without one, and that is what this wraps.
 */

/** Surfaces that can receive a plugin: a plugin store, and plugins not marked not-applicable. */
export function installTargets(registry: readonly SurfaceDescriptor[]): SurfaceDescriptor[] {
  return registry.filter(
    (surface) =>
      surface.stores.some((store) => store.kind === "plugin") &&
      !surface.notApplicable.includes("plugin"),
  );
}

/** Whether the surface can hold a project-scope plugin install. */
export function supportsProjectScope(surface: SurfaceDescriptor): boolean {
  if (surface.stores.some((store) => store.kind === "plugin" && store.scope === "project")) {
    return true;
  }
  return surface.pluginInstall?.kind === "native" && surface.pluginInstall.scope !== undefined;
}

/** `name@marketplace` from a catalog install command such as `/plugin install x@y`. */
export function identityFromInstallCommand(installCommand: string): string | null {
  const last = installCommand.trim().split(/\s+/).pop() ?? "";
  return /^[^@\s]+@[^@\s]+$/.test(last) ? last : null;
}

/** Surfaces whose detection probes exist on this machine (user scope, plus project when given). */
export async function detectSurfaces(
  fs: FsProvider,
  surfaces: readonly SurfaceDescriptor[],
  roots: { home: string; project: string | null; platform: "darwin" | "win32" | "linux" },
): Promise<Set<SurfaceId>> {
  const found = new Set<SurfaceId>();
  for (const surface of surfaces) {
    for (const probe of surface.detect) {
      const relative = probe.pathByPlatform?.[roots.platform] ?? probe.path;
      const base = probe.scope === "user" ? roots.home : roots.project;
      if (base === null) continue;
      try {
        if (await fs.exists(fs.joinPath(base, relative))) {
          found.add(surface.id);
          break;
        }
      } catch {
        // An unreadable probe is "not detected", never a failure of the picker.
      }
    }
  }
  return found;
}

export interface CatalogInstallView {
  plan: BrokerPlan;
  /** The exact installer invocation, when the broker could plan one. */
  cli: string | null;
  /** Why a direct apply is unavailable; null when it is available. */
  applyBlockedReason: string | null;
  prompt: string;
}

export function buildCatalogInstallPrompt(args: {
  identity: string;
  surfaceLabel: string;
  scope: SurfaceScope;
  invocation: string | null;
}): string {
  const lines = [
    `Install the plugin \`${args.identity}\` on ${args.surfaceLabel} at ${args.scope} scope, using ${args.surfaceLabel}'s own installer.`,
  ];
  if (args.invocation !== null) lines.push(`The installer invocation is: ${args.invocation}`);
  lines.push(
    "Never hand-edit the install record or the plugin cache; the installer keeps the two in step.",
    "Afterwards, confirm the plugin is listed as installed and report anything that failed.",
  );
  return lines.join("\n");
}

export function planCatalogInstall(args: {
  surface: SurfaceDescriptor;
  identity: string;
  scope: SurfaceScope;
  projectRoot: string | null;
  registry: readonly SurfaceDescriptor[];
  label: string;
}): CatalogInstallView {
  const plan = planPluginAction(
    {
      surface: args.surface.id,
      identity: args.identity,
      scope: args.scope,
      action: "install",
      projectRoot: args.projectRoot,
    },
    args.registry,
  );
  let cli: string | null = null;
  let applyBlockedReason: string | null;
  if (plan.kind === "native") {
    const native = plan.plan;
    if (native.supported) {
      cli = native.display;
      // The Rust installer bridge runs it; a missing binary is reported at
      // Apply time by the broker's `which` probe.
      applyBlockedReason = null;
    } else {
      applyBlockedReason = native.reason;
    }
  } else if (plan.kind === "unsupported") {
    applyBlockedReason = plan.reason;
  } else if (plan.plan.supported) {
    applyBlockedReason = null;
  } else {
    applyBlockedReason = plan.plan.reason;
  }
  return {
    plan,
    cli,
    applyBlockedReason,
    prompt: buildCatalogInstallPrompt({
      identity: args.identity,
      surfaceLabel: args.label,
      scope: args.scope,
      invocation: cli,
    }),
  };
}

/** Names of the marketplaces Claude Code already knows; missing or unreadable file is none. */
export async function readKnownMarketplaces(fs: FsProvider, home: string): Promise<string[]> {
  try {
    const text = await fs.readFile(fs.joinPath(home, ".claude", "plugins", "known_marketplaces.json"));
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? Object.keys(parsed) : [];
  } catch {
    return [];
  }
}

function lastLine(text: string): string | undefined {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines[lines.length - 1];
}

/**
 * Run a planned catalog install. Claude Code needs the catalog's marketplace
 * registered first, so it is added when `known_marketplaces.json` lacks it;
 * every other surface goes straight to the broker.
 */
export async function applyCatalogInstall(args: {
  view: CatalogInstallView;
  surface: SurfaceDescriptor;
  plugin: MarketplacePlugin;
  marketplaceName: string;
  marketplaceSource: string;
  runner: ProcessRunner;
  fs: FsProvider;
  home: string;
  now: string;
  readKnownMarketplaces: () => Promise<string[]>;
}): Promise<PluginActionOutcome> {
  if (args.surface.id === "claude-code") {
    const known = await args.readKnownMarketplaces();
    if (!known.includes(args.marketplaceName)) {
      const added = await args.runner.run({
        command: "claude",
        args: ["plugin", "marketplace", "add", args.marketplaceSource],
      });
      const failure =
        added.status === "ok"
          ? added.exitCode === 0
            ? null
            : (lastLine(added.stderr) ?? lastLine(added.stdout) ?? `exited with code ${added.exitCode}`)
          : added.status === "spawn-failed"
            ? added.reason
            : "timed out";
      if (failure !== null) {
        return {
          status: "failed",
          reason: `Couldn't add the ${args.marketplaceName} marketplace: ${failure}`,
        };
      }
    }
  }
  const catalogSkills =
    args.view.plan.kind === "unpack"
      ? args.plugin.skills.map((skill) => ({ dir: skill.dir, content: catalogSkillContent(skill) }))
      : undefined;
  return executePluginAction(args.view.plan, {
    runner: args.runner,
    fs: args.fs,
    now: args.now,
    homeRoot: args.home,
    ...(catalogSkills ? { catalogSkills } : {}),
  });
}
