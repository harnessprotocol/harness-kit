import { readHarnessFile } from "./tauri";
import type { HarnessFileResult } from "./tauri";
import { SyncFsProvider } from "./sync-fs";
import { grantProjectDir, projectDirLabel } from "./project-dir";
import { scopeHarnessPath } from "../pages/drift/drift-data";

/**
 * Which harness.yaml Profile and Compile work on (spec AC-55, Decisions
 * 2026-09-27 item 2): the personal `~/.claude/harness.yaml` when no project is
 * chosen in the title bar, else that project's committed `harness.yaml`, the
 * team baseline. The project file is read-only here: Profile edits and saves
 * only the personal file.
 */
export interface HarnessSource {
  kind: "personal" | "project";
  /** The plain label the page headers show. */
  label: string;
  /** The project root for `kind: "project"`, else null. */
  projectDir: string | null;
}

export function describeHarnessSource(projectDir: string | null): HarnessSource {
  return projectDir
    ? { kind: "project", label: `Team baseline · ${projectDirLabel(projectDir)}`, projectDir }
    : { kind: "personal", label: "Personal profile", projectDir: null };
}

/**
 * Read the source's harness.yaml. `found: false` means there is no file; a
 * file that cannot be read or a project the app has no access to rejects, so
 * a caller never shows "no harness.yaml" for a file it could not read.
 */
export async function readHarnessSource(projectDir: string | null): Promise<HarnessFileResult> {
  if (!projectDir) return readHarnessFile();
  if (!(await grantProjectDir(projectDir))) {
    throw new Error(`The app has no access to ${projectDir}. Choose the project again from the title bar.`);
  }
  const fs = new SyncFsProvider(projectDir);
  const path = scopeHarnessPath({ kind: "project", root: projectDir, label: projectDirLabel(projectDir), fs });
  if (!(await fs.exists(path))) return { found: false, content: null, path };
  return { found: true, content: await fs.readFile(path), path };
}
