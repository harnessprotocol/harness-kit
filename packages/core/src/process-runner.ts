/**
 * Process execution abstraction (design.md §4, D3) — one of core's injected
 * effects, alongside `FsProvider` and the definitions feed's `Fetcher` and
 * `SignatureVerifier`. Core never imports `node:child_process`; the
 * CLI backs this with a real spawn and the desktop with a Rust command, the
 * same split the filesystem already uses.
 *
 * This is the highest-risk seam in the engine: it runs third-party binaries
 * with arguments derived from files other tools wrote. Two rules make that
 * survivable, and both are structural rather than advisory:
 *
 * 1. **argv only, never a shell string.** `command` names an executable and
 *    `args` is passed as a vector. Implementations MUST NOT go through a
 *    shell, so quoting, `$(…)`, `;`, and `&&` in a plugin name are inert
 *    rather than clever.
 * 2. **No argument may look like a flag.** A shell is not the only injection
 *    target: a plugin literally named `--config` would become a flag to
 *    `claude plugin install` even under argv. `assertSafeArgs` rejects that
 *    before a command is built, so the check cannot be forgotten at a call
 *    site.
 */

/** One process to run. */
export interface ProcessCommand {
  /**
   * Executable name (resolved via PATH) or an absolute path. Never a shell
   * string — implementations do not spawn a shell.
   */
  command: string;
  /** Arguments as a vector. Not concatenated, not quoted, not interpolated. */
  args: string[];
  /** Working directory; the implementation's default when omitted. */
  cwd?: string;
  /**
   * Milliseconds before the runner kills the process. Omitted means the
   * implementation's default — an installer that hangs must not hang the
   * app, so implementations SHOULD apply one rather than waiting forever.
   */
  timeoutMs?: number;
  /**
   * Extra environment on top of what the implementation inherits. Callers
   * MUST NOT put credentials here: this is for things like `NO_COLOR`.
   */
  env?: Record<string, string>;
}

/**
 * The outcome of a run. Deliberately a discriminated union with no throwing
 * path: a missing binary and a non-zero exit are both ordinary answers a
 * caller must handle, not exceptions. `status: "ok"` means the process ran
 * to completion — it says nothing about whether it SUCCEEDED, which is
 * `exitCode`.
 */
export type ProcessResult =
  | { status: "ok"; exitCode: number; stdout: string; stderr: string }
  | { status: "spawn-failed"; reason: string }
  | { status: "timed-out"; stdout: string; stderr: string; timeoutMs: number };

export interface ProcessRunner {
  run(command: ProcessCommand): Promise<ProcessResult>;
  /**
   * Whether an executable is available, for capability probing before an
   * action is offered. Implementations MUST NOT run the binary to find out
   * — resolving it on PATH is enough, and running an unknown binary just to
   * see if it exists is exactly what this seam is guarding against.
   */
  which(command: string): Promise<string | null>;
}

/**
 * Reject an argument that a CLI would read as an option.
 *
 * Plugin identities come from `installed_plugins.json` and TOML tables that
 * other tools write, so they are attacker-influenceable by anything that can
 * install a plugin. Under argv a name containing `;` or `$(…)` is harmless,
 * but a name beginning `-` is not: `claude plugin install --config x=y` is a
 * different command than installing a plugin called `--config`.
 *
 * Bare `-` and `--` are rejected too — `--` ends option parsing on most
 * parsers, and a lone `-` means stdin to many.
 */
export function isFlagLike(argument: string): boolean {
  return argument.startsWith("-");
}

/** Thrown when a caller tries to build a command from unsafe arguments. */
export class UnsafeArgumentError extends Error {
  constructor(readonly argument: string) {
    super(
      `refusing to pass ${JSON.stringify(argument)} as a command argument: it would be read as an option, not a value`,
    );
    this.name = "UnsafeArgumentError";
  }
}

/**
 * Assert every VALUE argument is inert. Call it with the arguments derived
 * from observed data — not with the flags the caller itself chose, which are
 * flag-like by definition.
 *
 * Throws rather than returning a result: this guards a code path that
 * executes a binary, and a caller that forgets to check a returned boolean
 * would proceed to run the command anyway.
 */
export function assertSafeArgs(values: readonly string[]): void {
  for (const value of values) {
    if (value.length === 0 || isFlagLike(value)) throw new UnsafeArgumentError(value);
    // A NUL byte truncates the string for execve; anything after it would be
    // invisible in logs and in the error message a user is shown.
    if (value.includes("\0")) throw new UnsafeArgumentError(value);
  }
}
