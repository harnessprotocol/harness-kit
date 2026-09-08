import type { SurfaceScope } from "../surfaces/types.js";
import { assertSafeArgs } from "../process-runner.js";
import type { ProcessCommand } from "../process-runner.js";

/**
 * Native plugin installers (AC-18), as descriptor DATA rather than code.
 *
 * Every verb and flag below was read off the tool's own `--help`, not
 * assumed. The three differ enough that a shared template language would be
 * a lie:
 *
 * | surface     | install          | uninstall           | scope flag | json     |
 * |-------------|------------------|---------------------|------------|----------|
 * | claude-code | `plugin install` | `plugin uninstall`  | `--scope`  | none     |
 * | codex       | `plugin add`     | `plugin remove`     | none       | `--json` |
 * | copilot-cli | `plugin install` | `plugin uninstall`  | none       | none     |
 *
 * Note the asymmetry `copilot` has and the others do not: it installs by
 * `name@marketplace` but uninstalls by bare `name`. `uninstallSelector`
 * records that rather than letting a caller assume symmetry.
 */

/** Which form of the identity a verb takes as its positional argument. */
export type PluginSelector = "identity" | "name";

export interface NativePluginInstaller {
  /** Executable that performs installs, and the capability probe. */
  binary: string;
  /** Fixed argv before the selector, e.g. ["plugin", "install"]. */
  installArgs: readonly string[];
  /** Fixed argv before the selector, e.g. ["plugin", "uninstall"]. */
  uninstallArgs: readonly string[];
  /** What `install` takes positionally. */
  installSelector: PluginSelector;
  /** What `uninstall` takes positionally — not always the same. */
  uninstallSelector: PluginSelector;
  /**
   * How this installer expresses scope. Absent means it has no scope concept
   * and installs wherever it installs — a project-scope request against such
   * a surface is refused rather than silently landing at user scope.
   */
  scope?: {
    flag: string;
    /** null = this installer cannot express that scope. */
    values: Record<SurfaceScope, string | null>;
    /**
     * Scope values the installer accepts verbatim, beyond the two HarnessKit
     * models. When a request carries a `nativeScope` in this list it is used
     * as-is, so a copy reproduces the scope the source actually used instead
     * of collapsing to the mapped one.
     */
    nativeValues?: readonly string[];
  };
  /** Flag that makes the tool emit a machine-readable result, when it has one. */
  jsonFlag?: string;
}

/** One planned invocation, or a stated reason there is none. */
export type PluginActionPlan =
  | {
      supported: true;
      command: ProcessCommand;
      /** The exact invocation, for display next to the button (AC-28). */
      display: string;
      /** Binary that must exist for this to run. */
      binary: string;
      /** Whether stdout will be machine-readable. */
      structuredOutput: boolean;
    }
  | { supported: false; reason: string };

export interface PluginActionRequest {
  action: "install" | "uninstall";
  /** `name@marketplace`, as the grid's row key carries it. */
  identity: string;
  scope: SurfaceScope;
  /** Working directory — a project-scope action must run inside the project. */
  cwd?: string;
  /**
   * The scope value the SOURCE surface recorded, when known. Used verbatim if
   * the installer lists it in `nativeValues`. Claude Code distinguishes a
   * `local` install (private, settings.local.json) from a `project` one
   * (committed); both collapse to HarnessKit's project scope, and reproducing
   * the first as the second would share something the user kept private.
   */
  nativeScope?: string;
}

/** Split `name@marketplace` on the LAST `@`, matching both codecs. */
function splitIdentity(identity: string): { name: string; marketplace: string } | null {
  const at = identity.lastIndexOf("@");
  if (at <= 0 || at === identity.length - 1) return null;
  return { name: identity.slice(0, at), marketplace: identity.slice(at + 1) };
}

/** Render an argv vector the way a user would type it, for display only. */
function renderDisplay(binary: string, args: readonly string[]): string {
  return [binary, ...args]
    .map((part) => (/^[A-Za-z0-9_@./:=-]+$/.test(part) ? part : JSON.stringify(part)))
    .join(" ");
}

/**
 * Plan one native installer invocation. PURE — builds a command, runs
 * nothing. Never throws for bad input: an unusable request comes back
 * `supported: false` with a reason the UI can show, which is the same
 * contract `planStoreWrite` has.
 *
 * The one exception is an identity that would inject a flag. That throws
 * from `assertSafeArgs`, deliberately: it means observed data is hostile,
 * not that the user asked for something unsupported, and a caller must not
 * be able to paper over it with a fallback.
 */
export function planNativePluginAction(
  installer: NativePluginInstaller,
  request: PluginActionRequest,
): PluginActionPlan {
  const identity = splitIdentity(request.identity);
  if (identity === null) {
    return {
      supported: false,
      reason: `'${request.identity}' is not in '<name>@<marketplace>' form, so no installer command can be built for it.`,
    };
  }

  const verbArgs = request.action === "install" ? installer.installArgs : installer.uninstallArgs;
  const selectorKind =
    request.action === "install" ? installer.installSelector : installer.uninstallSelector;
  const selector = selectorKind === "identity" ? request.identity : identity.name;

  // Observed data becomes argv here. The selector is the field an attacker
  // most obviously controls, but it is not the only one: `binary`, the verb
  // args, the scope flag and its values all come from a descriptor, and the
  // definitions bundle deliberately accepts descriptors from a remote feed
  // (M4). Everything that is not a fixed literal in this repo gets checked.
  assertSafeArgs([selector]);

  const args: string[] = [...verbArgs, selector];

  if (installer.scope !== undefined) {
    const native = request.nativeScope;
    const acceptsNative =
      native !== undefined && (installer.scope.nativeValues ?? []).includes(native);
    const value = acceptsNative ? native : installer.scope.values[request.scope];
    if (value === null) {
      return {
        supported: false,
        reason: `${installer.binary} cannot install at ${request.scope} scope.`,
      };
    }
    // The scope VALUE can come from observed data via `nativeScope`. The flag
    // itself is descriptor data and legitimately starts with `-`, so it is
    // exempt by construction rather than by omission.
    assertSafeArgs([value]);
    args.push(installer.scope.flag, value);
  } else if (request.scope === "project") {
    // Silently installing at user scope when the user asked for project
    // scope would put the plugin somewhere they did not choose.
    return {
      supported: false,
      reason: `${installer.binary} has no scope option — it cannot install at project scope specifically.`,
    };
  }

  if (installer.jsonFlag !== undefined) args.push(installer.jsonFlag);

  return {
    supported: true,
    command: {
      command: installer.binary,
      args,
      ...(request.cwd !== undefined ? { cwd: request.cwd } : {}),
    },
    display: renderDisplay(installer.binary, args),
    binary: installer.binary,
    structuredOutput: installer.jsonFlag !== undefined,
  };
}
