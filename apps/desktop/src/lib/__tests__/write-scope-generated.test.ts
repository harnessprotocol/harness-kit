import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { homeWriteScope, projectWriteScope } from "@harness-kit/core";

/**
 * The Rust side embeds this file to validate user-scope writes (AC-36). It
 * cannot read the TypeScript registry, so drift between the two would silently
 * widen or narrow what the desktop is allowed to write. Regenerate with:
 *   node apps/desktop/scripts/generate-write-scope.mjs
 */
describe("generated Rust write scope", () => {
  it("matches the surface registry", () => {
    // vitest runs from apps/desktop; import.meta.url is not a file URL here.
    const path = join(process.cwd(), "src-tauri", "generated", "write-scope.json");
    const generated = JSON.parse(readFileSync(path, "utf8"));
    const sorted = ({ files, directories }: { files: ReadonlySet<string>; directories: readonly string[] }) => ({
      files: [...files].sort(),
      directories: [...directories].sort(),
    });
    const expected = {
      ...Object.fromEntries(
        (["darwin", "linux", "win32"] as const).map((platform) => [platform, sorted(homeWriteScope(platform))]),
      ),
      project: sorted(projectWriteScope()),
    };
    expect(generated).toEqual(expected);
  });
});
