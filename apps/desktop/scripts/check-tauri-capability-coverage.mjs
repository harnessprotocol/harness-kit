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

// ── Plugin permissions (AC-60) ───────────────────────────────────────────────
//
// The same packaged-build-only failure exists for plugin calls: `readTextFile` from
// @tauri-apps/plugin-fs needs `fs:allow-read-text-file`, `open` from plugin-shell needs
// `shell:allow-open`. Dev mode does not enforce them. These helpers map the JS imports
// of the fs / dialog / shell plugins to the permission each call needs, and check it
// against the capability's grants, expanded through the plugin's default and named
// permission sets in gen/schemas/acl-manifests.json.

export const CHECKED_PLUGINS = ["fs", "dialog", "shell"];

export const camelToKebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

// Permissions that satisfy a JS export, when the name is not simply allow-<kebab(export)>.
// Any one of the listed permissions is enough.
const ALTERNATIVES = {
  "shell:Command": ["allow-execute", "allow-spawn"],
};

/** Permissions (any one suffices) the JS export `fn` of plugin `plugin` needs, or null for a non-call export. */
export function requiredPermissions(plugin, fn) {
  const key = `${plugin}:${fn}`;
  if (ALTERNATIVES[key]) return ALTERNATIVES[key];
  // Types, enums and classes (BaseDirectory, FileHandle, ...) are not permission-gated calls.
  if (!/^[a-z]/.test(fn)) return null;
  return [`allow-${camelToKebab(fn)}`];
}

/**
 * Imports of the fs / dialog / shell plugins, static or dynamic. Returns
 * Map<"plugin:export", string[] locations>. `import type` and `type X` members are skipped.
 */
export function parsePluginImports(srcDir, rootForRelative = srcDir) {
  const found = new Map();
  const plugins = CHECKED_PLUGINS.join("|");
  const staticRe = new RegExp(
    `import\\s+(type\\s+)?\\{([^}]*)\\}\\s*from\\s*["']@tauri-apps/plugin-(${plugins})["']`,
    "g",
  );
  const dynamicRe = new RegExp(
    `\\{([\\w$,\\s]*)\\}\\s*=\\s*await\\s+import\\(\\s*["']@tauri-apps/plugin-(${plugins})["']\\s*\\)`,
    "g",
  );
  const add = (plugin, members, text, index, rel) => {
    const line = text.slice(0, index).split("\n").length;
    for (let member of members.split(",")) {
      member = member.trim();
      if (!member || /^type\s/.test(member)) continue;
      const name = member.split(/\s+as\s+/)[0].trim();
      const key = `${plugin}:${name}`;
      if (!found.has(key)) found.set(key, []);
      found.get(key).push(`${rel}:${line}`);
    }
  };
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (entry === "node_modules" || entry === "dist") continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
        const text = readFileSync(full, "utf8");
        const rel = full.slice(rootForRelative.length + 1);
        let m;
        while ((m = staticRe.exec(text)) !== null) {
          if (m[1]) continue;
          add(m[3], m[2], text, m.index, rel);
        }
        while ((m = dynamicRe.exec(text)) !== null) add(m[2], m[1], text, m.index, rel);
      }
    }
  })(srcDir);
  return found;
}

/**
 * Every "plugin:permission" a capability grants, with plugin default / named sets expanded.
 * A scoped object ({ identifier: "fs:allow-exists", allow: [...] }) grants its identifier.
 */
export function expandGrants(capsJson, manifests) {
  const caps = typeof capsJson === "string" ? JSON.parse(capsJson) : capsJson;
  const manifestOf = typeof manifests === "string" ? JSON.parse(manifests) : manifests;
  const granted = new Set();
  const grant = (plugin, id, seen = new Set()) => {
    const key = `${plugin}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    granted.add(key);
    const m = manifestOf[plugin];
    if (!m) return;
    const set =
      id === "default" ? m.default_permission : m.permission_sets?.[id];
    for (const inner of set?.permissions ?? []) grant(plugin, inner, seen);
  };
  for (const p of caps.permissions) {
    const id = typeof p === "string" ? p : p?.identifier;
    if (typeof id !== "string") continue;
    const colon = id.lastIndexOf(":");
    if (colon === -1) continue; // bare allow-* app commands are checked elsewhere
    // "core:window:allow-x" nests, so the plugin key is everything before the last colon.
    grant(id.slice(0, colon), id.slice(colon + 1));
  }
  return granted;
}

/** Pure analysis: imports needing a permission the capability does not grant, or that does not exist. */
export function analyzePluginPermissions({ imports, granted, manifests }) {
  const manifestOf = typeof manifests === "string" ? JSON.parse(manifests) : manifests;
  const missingGrant = [];
  const unknownPermission = [];
  for (const [key, locs] of imports) {
    const [plugin, fn] = key.split(":");
    const needed = requiredPermissions(plugin, fn);
    if (!needed) continue;
    const known = manifestOf[plugin]?.permissions ?? {};
    if (!needed.some((id) => id in known)) {
      unknownPermission.push([key, needed, locs]);
      continue;
    }
    if (!needed.some((id) => granted.has(`${plugin}:${id}`))) {
      missingGrant.push([key, needed.map((id) => `${plugin}:${id}`), locs]);
    }
  }
  return { missingGrant, unknownPermission };
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
  // Plugin permissions: fs / dialog / shell JS imports against the grants in the capability.
  const manifests = JSON.parse(
    readFileSync(join(desktopRoot, "src-tauri/gen/schemas/acl-manifests.json"), "utf8"),
  );
  const granted = expandGrants(
    readFileSync(join(desktopRoot, "src-tauri/capabilities/default.json"), "utf8"),
    manifests,
  );
  const imports = parsePluginImports(srcDir, desktopRoot);
  const { missingGrant, unknownPermission } = analyzePluginPermissions({ imports, granted, manifests });
  if (missingGrant.length) {
    failed = true;
    console.error(
      `\n::error::${missingGrant.length} plugin call(s) imported by the webview are not granted by capabilities/default.json.`,
    );
    console.error("These work under `tauri dev` but are refused in the packaged build:");
    for (const [key, perms, locs] of missingGrant.sort()) {
      console.error(`  - ${key}  (needs ${perms.join(" or ")})  e.g. ${locs[0]}`);
    }
  }
  if (unknownPermission.length) {
    failed = true;
    console.error(
      `\n::error::${unknownPermission.length} plugin import(s) map to a permission that gen/schemas/acl-manifests.json does not define (update requiredPermissions, or regenerate the manifest with a build):`,
    );
    for (const [key, perms, locs] of unknownPermission.sort()) {
      console.error(`  - ${key}  (expected ${perms.join(" or ")})  e.g. ${locs[0]}`);
    }
  }

  if (failed) {
    console.error("\nAdd the missing allow-* entry to capabilities/default.json (and register the command in lib.rs).");
    process.exit(1);
  }
  console.log(
    `Tauri capability coverage OK: ${invoked.size} invoked command(s), ${registered.size} registered, ${allowed.size} allow-* permissions; ${imports.size} plugin import(s) all granted.`,
  );
}

// Only run the CLI when executed directly, not when imported by tests.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
