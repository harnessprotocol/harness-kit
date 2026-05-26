#!/usr/bin/env node
// check-tauri-capability-coverage.mjs
//
// Static guard against the class of bug fixed in commit ffc019d: a Tauri command
// is registered in Rust and invoked from the frontend, but has no `allow-*` entry
// in capabilities/default.json. `tauri dev` auto-allows every command, so this only
// surfaces at runtime in the packaged build — by which point it has already shipped.
//
// Fails if either invariant is violated:
//   1. A command invoked from the frontend has no matching `allow-<kebab>` capability.
//   2. A command invoked from the frontend is not registered in generate_handler!.
//
// Exported as functions so the parser itself is unit-tested (see __tests__), and run
// as a CLI against the real project paths when executed directly.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const kebab = (s) => s.replace(/_/g, "-");

// Commands registered in tauri::generate_handler![ ... ]
export function parseRegisteredCommands(libRsSource) {
  const start = libRsSource.indexOf("generate_handler![");
  if (start === -1) throw new Error("generate_handler! not found in lib.rs");
  const end = libRsSource.indexOf("])", start);
  const block = libRsSource.slice(start, end);
  const set = new Set();
  for (let line of block.split("\n")) {
    line = line.trim();
    if (line.startsWith("//") || !line) continue;
    line = line.replace(/,$/, "").trim();
    if (!/^[A-Za-z0-9_:]+$/.test(line)) continue;
    const name = line.includes("::") ? line.split("::").pop() : line;
    if (/^[a-z_][a-z0-9_]*$/.test(name)) set.add(name);
  }
  return set;
}

// Bare `allow-*` command permissions in capabilities/default.json (plugin permissions
// are namespaced, e.g. fs:allow-read-text-file, and ignored here).
export function parseAllowedCommands(capsJson) {
  const caps = typeof capsJson === "string" ? JSON.parse(capsJson) : capsJson;
  const set = new Set();
  for (const p of caps.permissions) {
    const id = typeof p === "string" ? p : p?.identifier;
    if (typeof id === "string" && id.startsWith("allow-")) set.add(id.slice("allow-".length));
  }
  return set;
}

// Commands invoked from the frontend via invoke("name", ...) / invoke<T>("name", ...).
// Returns Map<command, string[] locations>.
export function parseInvokedCommands(srcDir, rootForRelative = srcDir) {
  const found = new Map();
  const re = /\binvoke\s*(?:<[^>]*>)?\s*\(\s*(["'`])([a-zA-Z_][a-zA-Z0-9_]*)\1/g;
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (entry === "node_modules" || entry === "dist") continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
        const text = readFileSync(full, "utf8");
        let m;
        while ((m = re.exec(text)) !== null) {
          const cmd = m[2];
          const line = text.slice(0, m.index).split("\n").length;
          const rel = full.slice(rootForRelative.length + 1);
          if (!found.has(cmd)) found.set(cmd, []);
          found.get(cmd).push(`${rel}:${line}`);
        }
      }
    }
  })(srcDir);
  return found;
}

// Pure analysis: given the three parsed sets, compute violations.
export function analyzeCoverage({ registered, allowed, invoked }) {
  const missingPerm = [];
  const notRegistered = [];
  for (const [cmd, locs] of invoked) {
    if (!allowed.has(kebab(cmd))) missingPerm.push([cmd, locs]);
    if (!registered.has(cmd)) notRegistered.push([cmd, locs]);
  }
  return { missingPerm, notRegistered };
}

function runCli() {
  const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const registered = parseRegisteredCommands(
    readFileSync(join(desktopRoot, "src-tauri/src/lib.rs"), "utf8"),
  );
  const allowed = parseAllowedCommands(
    readFileSync(join(desktopRoot, "src-tauri/capabilities/default.json"), "utf8"),
  );
  const srcDir = join(desktopRoot, "src");
  const invoked = parseInvokedCommands(srcDir, desktopRoot);
  const { missingPerm, notRegistered } = analyzeCoverage({ registered, allowed, invoked });

  let failed = false;
  if (missingPerm.length) {
    failed = true;
    console.error(
      `\n::error::${missingPerm.length} frontend-invoked command(s) have no 'allow-<kebab>' entry in capabilities/default.json.`,
    );
    console.error("These work under `tauri dev` but fail in the packaged build (ACL enforced):");
    for (const [cmd, locs] of missingPerm.sort()) {
      console.error(`  - ${cmd}  (expected permission: allow-${kebab(cmd)})  e.g. ${locs[0]}`);
    }
  }
  if (notRegistered.length) {
    failed = true;
    console.error(
      `\n::error::${notRegistered.length} frontend-invoked command(s) are not registered in generate_handler! (typo or removed command):`,
    );
    for (const [cmd, locs] of notRegistered.sort()) {
      console.error(`  - ${cmd}  e.g. ${locs[0]}`);
    }
  }
  if (failed) {
    console.error("\nAdd the missing allow-* entry to capabilities/default.json (and register the command in lib.rs).");
    process.exit(1);
  }
  console.log(
    `Tauri capability coverage OK: ${invoked.size} invoked command(s), ${registered.size} registered, ${allowed.size} allow-* permissions.`,
  );
}

// Only run the CLI when executed directly, not when imported by tests.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
