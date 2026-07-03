import { describe, it, expect } from "vitest";
// @ts-expect-error — plain .mjs guard script, no types needed
import {
  kebab,
  parseRegisteredCommands,
  parseAllowedCommands,
  analyzeCoverage,
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
