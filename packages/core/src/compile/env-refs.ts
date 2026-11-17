/**
 * Env-reference dialects. harness.yaml and core's normalized form always use
 * `${NAME}`. Cursor and VS Code document `${env:NAME}` for the same thing (VS
 * Code does not resolve a bare `${VAR}`), so those targets are written in the
 * "vscode" dialect and read back to `${NAME}`. Every other target is "plain".
 */
export type EnvRefDialect = "plain" | "vscode";

const PLAIN_REF = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const VSCODE_REF = /\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g;

/**
 * VS Code and Cursor predefined variables. `${workspaceFolder}` is a variable
 * the editor resolves itself, not an environment variable, so it is never
 * rewritten to `${env:workspaceFolder}`.
 */
export const VSCODE_PREDEFINED_VARIABLES: ReadonlySet<string> = new Set([
  "workspaceFolder",
  "workspaceFolderBasename",
  "userHome",
  "cwd",
  "pathSeparator",
  "/",
  "file",
  "fileWorkspaceFolder",
  "relativeFile",
  "relativeFileDirname",
  "fileBasename",
  "fileBasenameNoExtension",
  "fileExtname",
  "fileDirname",
  "fileDirnameBasename",
  "lineNumber",
  "selectedText",
  "execPath",
  "defaultBuildTask",
]);

/**
 * Canonical `${NAME}` -> the target's dialect. `${env:X}`, `${input:x}`, `$X`
 * and VS Code predefined variables are untouched.
 */
export function toDialect(value: string, dialect: EnvRefDialect): string {
  if (dialect !== "vscode") return value;
  return value.replace(PLAIN_REF, (match, name: string) =>
    VSCODE_PREDEFINED_VARIABLES.has(name) ? match : `\${env:${name}}`,
  );
}

/**
 * A target's `${env:NAME}` -> canonical `${NAME}`. `${env:workspaceFolder}` is a
 * real environment variable that happens to share a predefined name, and stays
 * as written so it is never equated with the predefined `${workspaceFolder}`.
 */
export function fromDialect(value: string): string {
  return value.replace(VSCODE_REF, (match, name: string) =>
    VSCODE_PREDEFINED_VARIABLES.has(name) ? match : `\${${name}}`,
  );
}
