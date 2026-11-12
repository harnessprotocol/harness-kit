import { describe, it, expect } from "vitest";
// @ts-expect-error — plain .mjs guard script, no types needed
import {
  kebab,
  parseRegisteredCommands,
  parseAllowedCommands,
  analyzeCoverage,
  camelToKebab,
  requiredPermissions,
  expandGrants,
  analyzePluginPermissions,
} from "../check-tauri-capability-coverage.mjs";

const LIB_RS = `
    .invoke_handler(tauri::generate_handler![
        // Plugins
        commands::plugins::list_installed_plugins,
        commands::plugins::uninstall_plugin,
        // Parity
        commands::parity::run_parity_scan,
    ])
    .setup(|app| {
`;

const CAPS = JSON.stringify({
  permissions: [
    "core:default",
    "fs:allow-read-text-file", // namespaced plugin perm — must be ignored
    "allow-list-installed-plugins",
    "allow-uninstall-plugin",
    "allow-run-parity-scan",
    { identifier: "shell:allow-execute", allow: [] }, // namespaced object — ignored
  ],
});

describe("capability-coverage parser", () => {
  it("extracts registered command names from generate_handler!", () => {
    const registered = parseRegisteredCommands(LIB_RS);
    expect([...registered].sort()).toEqual([
      "list_installed_plugins",
      "run_parity_scan",
      "uninstall_plugin",
    ]);
  });

  it("extracts only bare allow-* permissions (ignores namespaced)", () => {
    const allowed = parseAllowedCommands(CAPS);
    expect([...allowed].sort()).toEqual([
      "list-installed-plugins",
      "run-parity-scan",
      "uninstall-plugin",
    ]);
  });

  it("passes when every invoked command is registered and permitted", () => {
    const registered = parseRegisteredCommands(LIB_RS);
    const allowed = parseAllowedCommands(CAPS);
    const invoked = new Map([["list_installed_plugins", ["src/a.ts:1"]]]);
    const { missingPerm, notRegistered } = analyzeCoverage({ registered, allowed, invoked });
    expect(missingPerm).toHaveLength(0);
    expect(notRegistered).toHaveLength(0);
  });

  it("flags an invoked command with no allow-* entry (the ffc019d bug)", () => {
    const registered = new Set(["secret_command"]); // registered but not permitted
    const allowed = parseAllowedCommands(CAPS);
    const invoked = new Map([["secret_command", ["src/a.ts:7"]]]);
    const { missingPerm } = analyzeCoverage({ registered, allowed, invoked });
    expect(missingPerm.map(([c]) => c)).toEqual(["secret_command"]);
  });

  it("flags an invoked command that is not registered (typo / removed)", () => {
    const registered = parseRegisteredCommands(LIB_RS);
    const allowed = parseAllowedCommands(CAPS);
    const invoked = new Map([["totally_bogus_cmd", ["src/a.ts:9"]]]);
    const { notRegistered } = analyzeCoverage({ registered, allowed, invoked });
    expect(notRegistered.map(([c]) => c)).toEqual(["totally_bogus_cmd"]);
  });

  it("kebab-cases snake_case command names", () => {
    expect(kebab("read_plugin_tree")).toBe("read-plugin-tree");
  });
});

const MANIFESTS = {
  fs: {
    default_permission: { identifier: "default", permissions: ["allow-exists"] },
    permission_sets: { "read-dirs": { identifier: "read-dirs", permissions: ["allow-read-dir"] } },
    permissions: {
      "allow-exists": {},
      "allow-lstat": {},
      "allow-read-dir": {},
      "allow-read-text-file": {},
      "allow-write-text-file": {},
    },
  },
  shell: {
    default_permission: { identifier: "default", permissions: ["allow-open"] },
    permission_sets: {},
    permissions: { "allow-open": {}, "allow-execute": {}, "allow-spawn": {} },
  },
};

describe("plugin permission coverage (AC-60)", () => {
  it("maps a JS export to its permission", () => {
    expect(camelToKebab("readTextFile")).toBe("read-text-file");
    expect(requiredPermissions("fs", "readTextFile")).toEqual(["allow-read-text-file"]);
    expect(requiredPermissions("shell", "open")).toEqual(["allow-open"]);
    expect(requiredPermissions("shell", "Command")).toEqual(["allow-execute", "allow-spawn"]);
    expect(requiredPermissions("fs", "BaseDirectory")).toBeNull();
  });

  it("expands a default and a named set, and scoped object grants", () => {
    const granted = expandGrants(
      { permissions: ["fs:default", "fs:read-dirs", { identifier: "fs:allow-lstat", allow: [] }, "core:window:allow-x", "allow-bare"] },
      MANIFESTS,
    );
    for (const id of ["fs:allow-exists", "fs:allow-read-dir", "fs:allow-lstat", "core:window:allow-x"]) {
      expect(granted.has(id), id).toBe(true);
    }
    expect(granted.has("fs:allow-read-text-file")).toBe(false);
    expect(granted.has("allow-bare")).toBe(false);
  });

  it("flags a plugin call whose permission is not granted", () => {
    const imports = new Map([
      ["fs:readTextFile", ["src/a.ts:1"]],
      ["fs:exists", ["src/b.ts:2"]],
    ]);
    const granted = expandGrants({ permissions: ["fs:default"] }, MANIFESTS);
    const { missingGrant, unknownPermission } = analyzePluginPermissions({ imports, granted, manifests: MANIFESTS });
    expect(missingGrant.map(([k]) => k)).toEqual(["fs:readTextFile"]);
    expect(unknownPermission).toHaveLength(0);
  });

  it("passes when the grant arrives through the plugin default set", () => {
    const imports = new Map([["shell:open", ["src/a.ts:1"]]]);
    const granted = expandGrants({ permissions: ["shell:default"] }, MANIFESTS);
    const { missingGrant } = analyzePluginPermissions({ imports, granted, manifests: MANIFESTS });
    expect(missingGrant).toHaveLength(0);
  });

  it("flags an import that maps to a permission the manifest does not define", () => {
    const imports = new Map([["fs:frobnicate", ["src/a.ts:1"]]]);
    const granted = expandGrants({ permissions: ["fs:default"] }, MANIFESTS);
    const { unknownPermission } = analyzePluginPermissions({ imports, granted, manifests: MANIFESTS });
    expect(unknownPermission.map(([k]) => k)).toEqual(["fs:frobnicate"]);
  });
});
