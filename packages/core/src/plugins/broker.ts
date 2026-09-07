import type { FsProvider } from "../fs-provider.js";
import type { ProcessResult, ProcessRunner } from "../process-runner.js";
import { UnsafeArgumentError } from "../process-runner.js";
import { getSurface } from "../surfaces/registry.js";
import type { SurfaceId, SurfaceScope } from "../surfaces/types.js";
import { planNativePluginAction } from "./installer.js";
import type { PluginActionPlan } from "./installer.js";
import { planUnpackAction } from "./unpack.js";
import type { UnpackPlan } from "./unpack.js";

/**
 * PluginBroker (AC-18, AC-19, design.md §6).
 *
 * Two drivers behind one call:
 * - **native** shells out to the surface's own installer. This is the only
 *   correct mechanism where one exists — the tool keeps a cache alongside its
 *   install record, and editing the record by hand would leave the two
 *   disagreeing.
 * - **unpack** is for surfaces with no plugin model (pi, opencode): the
 *   plugin's skills and instructions are written into surface-native
 *   locations through the ordinary transaction engine, and what was written
 *   is recorded so update and uninstall stay possible.
 *
 * Planning is separated from execution on purpose. `planPluginAction` is pure
 * and runs nothing, so the CLI can print the exact invocation, the desktop
 * can show it beside the button (AC-28), and `--dry-run` is the same code
 * path as a real run minus one call.
 */

export interface PluginBrokerRequest {
  surface: SurfaceId;
  /** `name@marketplace`, exactly as the grid row carries it. */
  identity: string;
  scope: SurfaceScope;
  action: "install" | "uninstall";
  /** Project root — required for a project-scope action. */
  projectRoot?: string | null;
}

export type BrokerPlan =
  | { kind: "native"; action: "install" | "uninstall"; plan: PluginActionPlan }
  | { kind: "unpack"; action: "install" | "uninstall"; plan: UnpackPlan }
  | { kind: "unsupported"; reason: string };

/**
 * Decide what would happen, without doing it. Pure apart from the registry
 * lookup; the unpack driver's own planning needs IO and is deferred to
 * `executePluginAction`.
 */
export function planPluginAction(request: PluginBrokerRequest): BrokerPlan {
  const descriptor = getSurface(request.surface);
  const model = descriptor.pluginInstall;
  if (model === undefined) {
    return {
      kind: "unsupported",
      reason: `${descriptor.label} has no plugin installer HarnessKit can drive — use the agent prompt for this cell.`,
    };
  }
  if (model.kind === "unpack") {
    return { kind: "unpack", action: request.action, plan: planUnpackAction(descriptor, request) };
  }
  if (request.scope === "project" && (request.projectRoot ?? null) === null) {
    return {
      kind: "unsupported",
      reason: "a project-scope plugin action needs a project directory to run in.",
    };
  }
  try {
    return {
      kind: "native",
      action: request.action,
      plan: planNativePluginAction(model, {
        action: request.action,
        identity: request.identity,
        scope: request.scope,
        ...(request.scope === "project" && request.projectRoot
          ? { cwd: request.projectRoot }
          : {}),
      }),
    };
  } catch (error) {
    // assertSafeArgs throws when observed data would inject a flag. That is a
    // refusal to act on hostile input, not an unsupported request, and it
    // must reach the user as such rather than as a generic failure.
    if (error instanceof UnsafeArgumentError) {
      return {
        kind: "unsupported",
        reason: `refusing to run an installer with ${JSON.stringify(error.argument)} as the plugin name — it would be read as a command option.`,
      };
    }
    throw error;
  }
}

/** What actually happened. */
export type PluginActionOutcome =
  | {
      status: "installed" | "uninstalled";
      /** The invocation that ran, for the transcript. */
      display: string;
      /** Files written, for the unpack driver; empty for native installs. */
      files: string[];
      /** Parsed installer output when the tool emits structured results. */
      details?: Record<string, unknown>;
    }
  | { status: "refused"; reason: string }
  | { status: "failed"; reason: string; stdout?: string; stderr?: string };

/**
 * Extract a short, useful failure line from installer output.
 *
 * Installers put their real error on stderr, but not all of them: some write
 * it to stdout and exit non-zero. Taking the LAST non-empty line of whichever
 * stream has content keeps progress chatter out of the message a user sees.
 */
function failureReason(result: ProcessResult & { status: "ok" }): string {
  const source = result.stderr.trim().length > 0 ? result.stderr : result.stdout;
  const lines = source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const last = lines[lines.length - 1];
  return last ?? `exited with code ${result.exitCode}`;
}

/** Parse a structured installer result, tolerating a tool that lies about `--json`. */
function parseDetails(stdout: string): Record<string, unknown> | undefined {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) return undefined;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    // A tool that advertises --json and emits prose is not an error worth
    // failing an otherwise-successful install over.
    return undefined;
  }
}

export interface ExecuteOptions {
  runner: ProcessRunner;
  fs: FsProvider;
  /** Injected clock — core never reads Date.now itself. */
  now: string;
  /** Source surface to copy plugin contents FROM, for the unpack driver. */
  sourceSurface?: SurfaceId;
  homeRoot?: string;
}

/**
 * Run a planned action. Never throws for an ordinary failure: a missing
 * binary, a non-zero exit and a refusal are all outcomes the caller renders.
 */
export async function executePluginAction(
  plan: BrokerPlan,
  options: ExecuteOptions,
): Promise<PluginActionOutcome> {
  if (plan.kind === "unsupported") return { status: "refused", reason: plan.reason };

  if (plan.kind === "unpack") {
    if (!plan.plan.supported) return { status: "refused", reason: plan.plan.reason };
    return plan.plan.execute(options);
  }

  if (!plan.plan.supported) return { status: "refused", reason: plan.plan.reason };
  const { command, display, binary, structuredOutput } = plan.plan;

  // Probe before running: "codex is not installed" is a far more useful
  // message than whatever a failed spawn produces, and probing costs nothing.
  if ((await options.runner.which(binary)) === null) {
    return {
      status: "refused",
      reason: `${binary} is not installed or not on PATH, so HarnessKit cannot drive it. Install it, or use the agent prompt for this cell.`,
    };
  }

  const result = await options.runner.run(command);
  if (result.status === "spawn-failed") {
    return { status: "failed", reason: result.reason };
  }
  if (result.status === "timed-out") {
    return {
      status: "failed",
      reason: `${binary} did not finish within ${Math.round(result.timeoutMs / 1000)}s and was stopped.`,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }
  if (result.exitCode !== 0) {
    return {
      status: "failed",
      reason: failureReason(result),
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }
  return {
    // From the REQUEST, never inferred from argv: reading the verb back out
    // of the command we just built would silently follow a descriptor change.
    status: plan.action === "install" ? "installed" : "uninstalled",
    display,
    files: [],
    ...(structuredOutput ? { details: parseDetails(result.stdout) } : {}),
  };
}
