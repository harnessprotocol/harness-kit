import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SURFACE_IDS } from "@harness-kit/core";

/**
 * `record_transaction` validates surface ids in Rust against a copy of the
 * registry's list (changes.rs `SURFACE_IDS`). A drifted copy would refuse a
 * real surface's ledger row or accept an invented one.
 */
describe("Rust surface id list", () => {
  it("matches the surface registry", () => {
    const source = readFileSync(join(process.cwd(), "src-tauri", "src", "commands", "changes.rs"), "utf8");
    const block = /SURFACE_IDS: \[&str; \d+\] = \[([^\]]*)\]/.exec(source);
    expect(block).not.toBeNull();
    const ids = [...block![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect([...ids].sort()).toEqual([...SURFACE_IDS].sort());
  });
});
