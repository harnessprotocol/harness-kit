import { execFile } from "node:child_process";
import type { ProcessCommand, ProcessResult, ProcessRunner } from "./process-runner.js";

/**
 * Node-backed ProcessRunner for the CLI (design.md §4). Lives beside
 * `fs-node.ts` and is exported only from the `node` entry point, so the
 * webview bundle never pulls `node:child_process` in — the same rule the
 * `node:crypto` crash institutionalized.
 *
 * `execFile`, never `exec`: `exec` runs the string through `/bin/sh`, which
 * would make every character in a plugin name a potential command. `execFile`
 * passes argv straight to the OS, and `shell` is left at its default `false`
 * rather than being set explicitly, so a future edit cannot flip it without
 * being obvious.
 */

/** Installers clone repositories; a minute is generous and still bounded. */
const DEFAULT_TIMEOUT_MS = 60_000;

/** Cap captured output so a runaway installer cannot exhaust memory. */
const MAX_OUTPUT_BYTES = 1024 * 1024;

export class NodeProcessRunner implements ProcessRunner {
  constructor(private readonly defaultCwd?: string) {}

  async run(command: ProcessCommand): Promise<ProcessResult> {
    const timeoutMs = command.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    return new Promise<ProcessResult>((resolve) => {
      const child = execFile(
        command.command,
        command.args,
        {
          cwd: command.cwd ?? this.defaultCwd,
          timeout: timeoutMs,
          maxBuffer: MAX_OUTPUT_BYTES,
          // Inherit the ambient environment so the installer finds its own
          // config and credentials, plus whatever the caller adds. Callers
          // are contractually barred from putting secrets in `env`.
          //
          // NO_COLOR is defaulted on: captured output ends up in error
          // messages and eventually in a UI, and ANSI escapes there are
          // noise at best. A caller can still override it.
          env: { NO_COLOR: "1", ...process.env, ...command.env },
        },
        (error, stdout, stderr) => {
          const out = String(stdout ?? "");
          const err = String(stderr ?? "");
          if (error === null) {
            resolve({ status: "ok", exitCode: 0, stdout: out, stderr: err });
            return;
          }
          const failure = error as NodeJS.ErrnoException & { code?: number | string; killed?: boolean };
          // A timeout kill and a signal death both arrive here with no
          // numeric exit code; `killed` plus the timeout we set distinguishes
          // the first, which the caller must report differently from a
          // clean non-zero exit.
          if (failure.killed === true) {
            resolve({ status: "timed-out", stdout: out, stderr: err, timeoutMs });
            return;
          }
          if (typeof failure.code === "number") {
            resolve({ status: "ok", exitCode: failure.code, stdout: out, stderr: err });
            return;
          }
          // ENOENT (binary absent), EACCES (present but not executable), and
          // anything else that prevented the process from running at all.
          resolve({
            status: "spawn-failed",
            reason: `${command.command}: ${failure.message}`,
          });
        },
      );
      child.on("error", () => {
        // The callback above already resolves on spawn errors; this listener
        // exists so an 'error' event with no callback path cannot become an
        // unhandled exception that takes the process down.
      });
    });
  }

  /**
   * Resolve an executable WITHOUT running it. `command -v` is a shell
   * builtin, so it is deliberately not used — the point of this method is to
   * answer "is this installed" without executing anything the user has not
   * asked for.
   */
  async which(command: string): Promise<string | null> {
    // An absolute or relative path is answered by the filesystem, not PATH.
    if (command.includes("/") || command.includes("\\")) {
      const { access, constants } = await import("node:fs/promises");
      try {
        await access(command, constants.X_OK);
        return command;
      } catch {
        return null;
      }
    }
    const { access, constants } = await import("node:fs/promises");
    const { join, delimiter } = await import("node:path");
    const pathVar = process.env.PATH ?? "";
    const extensions =
      process.platform === "win32"
        ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";")
        : [""];
    for (const directory of pathVar.split(delimiter)) {
      if (directory.length === 0) continue;
      for (const extension of extensions) {
        const candidate = join(directory, `${command}${extension}`);
        try {
          await access(candidate, constants.X_OK);
          return candidate;
        } catch {
          // Not here; keep looking.
        }
      }
    }
    return null;
  }
}
