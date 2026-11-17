import type { ProcessCommand, ProcessResult, ProcessRunner } from "@harness-kit/core";
import { runPluginInstaller, whichPluginInstaller } from "./tauri";

/**
 * `ProcessRunner` for the webview. The webview cannot spawn anything itself;
 * both methods go to Rust commands that allowlist the binary and the argument
 * shape.
 *
 * `env` and `timeoutMs` on the command are ignored on purpose: Rust owns both
 * (it adds `NO_COLOR=1` and applies its own 180 second timeout), so a caller
 * cannot loosen either from the page.
 */
export class TauriProcessRunner implements ProcessRunner {
  run(cmd: ProcessCommand): Promise<ProcessResult> {
    return runPluginInstaller(cmd.command, cmd.args, cmd.cwd ?? null);
  }

  which(command: string): Promise<string | null> {
    return whichPluginInstaller(command);
  }
}
