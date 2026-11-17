/**
 * Env-reference dialects. harness.yaml and core's normalized form always use
 * `${NAME}`. Cursor and VS Code document `${env:NAME}` for the same thing (VS
 * Code does not resolve a bare `${VAR}`), so those targets are written in the
 * "vscode" dialect and read back to `${NAME}`. Every other target is "plain".
 */
export type EnvRefDialect = "plain" | "vscode";

const PLAIN_REF = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const VSCODE_REF = /\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** Canonical `${NAME}` -> the target's dialect. `${env:X}`, `${input:x}` and `$X` are untouched. */
export function toDialect(value: string, dialect: EnvRefDialect): string {
  return dialect === "vscode" ? value.replace(PLAIN_REF, "${env:$1}") : value;
}

/** A target's `${env:NAME}` -> canonical `${NAME}`. */
export function fromDialect(value: string): string {
  return value.replace(VSCODE_REF, "${$1}");
}
