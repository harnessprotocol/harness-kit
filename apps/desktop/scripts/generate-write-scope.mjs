#!/usr/bin/env node
/**
 * Emit the Rust side's user-scope write allowlist from the surface registry.
 *
 * The registry is TypeScript, but the Tauri command that performs a
 * user-scope write must validate paths itself — trusting the webview to pass
 * a correct allowlist would defeat the point of validating in Rust at all.
 * So the allowlist is generated here and embedded with include_str!, and a
 * test asserts the checked-in file still matches the registry.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homeWriteScope } from "@harness-kit/core";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "src-tauri", "generated", "write-scope.json");

const scope = Object.fromEntries(
  ["darwin", "linux", "win32"].map((platform) => {
    const { files, directories } = homeWriteScope(platform);
    return [platform, { files: [...files].sort(), directories: [...directories].sort() }];
  }),
);

writeFileSync(out, `${JSON.stringify(scope, null, 2)}\n`);
console.log(`wrote ${out}`);
