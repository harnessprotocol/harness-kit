import { describe, expect, it } from "vitest";
import {
  STATE_SCHEMA_VERSION,
  STATE_VERSION_PROBES,
  stateSchemaStatements,
} from "../src/state/schema.js";

/**
 * The schema is the single source shared by the CLI (node:sqlite) and the
 * desktop (Rust, via a generated artifact). These tests pin the migration
 * arithmetic; the CLI's own suite pins that the DDL still produces the
 * tables it expects.
 */
describe("state schema", () => {
  it("migrates a fresh database through every version", () => {
    const statements = stateSchemaStatements(0);
    expect(statements.length).toBeGreaterThan(0);
    const sql = statements.join("\n");
    // v1 tables and the v2 ledger both have to exist after a cold start.
    for (const table of ["observations", "observed_resources", "fingerprints", "transactions"]) {
      expect(sql).toContain(table);
    }
    expect(sql).toContain("transaction_id");
  });

  it("migrates a v1 database with the v2 step only", () => {
    const sql = stateSchemaStatements(1).join("\n");
    expect(sql).toContain("transaction_id");
    // Nothing from v1 should re-run — CREATE TABLE observations is v1's job.
    expect(sql).not.toContain("CREATE TABLE IF NOT EXISTS observations");
  });

  it("is a no-op at the current version", () => {
    expect(stateSchemaStatements(STATE_SCHEMA_VERSION)).toEqual([]);
  });

  it("has a probe for every version, highest first", () => {
    // Probes are how an EXISTING database reports its version, and they are
    // checked highest-first. A version with no probe reports as the previous
    // one and re-runs that migration on every open.
    const versions = STATE_VERSION_PROBES.map((probe) => probe.version);
    expect(versions).toEqual([...versions].sort((a, b) => b - a));
    for (let version = 1; version <= STATE_SCHEMA_VERSION; version += 1) {
      expect(versions, `no probe for v${version}`).toContain(version);
    }
  });

  it("does not re-run a DESTRUCTIVE migration on an up-to-date database", () => {
    // v4 opens with `DROP TABLE IF EXISTS definitions_cache`. A v4 database
    // that probed as v3 would discard a populated definitions cache on every
    // single startup, silently, and re-fetch each time. This is the guard
    // that stops a missing probe from being destructive rather than wasteful.
    expect(stateSchemaStatements(STATE_SCHEMA_VERSION)).toEqual([]);
    const destructive = stateSchemaStatements(STATE_SCHEMA_VERSION - 1).filter((sql) =>
      sql.startsWith("DROP TABLE"),
    );
    for (const sql of destructive) {
      const table = sql.replace("DROP TABLE IF EXISTS ", "").trim();
      expect(
        STATE_VERSION_PROBES.some((probe) => probe.version === STATE_SCHEMA_VERSION),
        `v${STATE_SCHEMA_VERSION} drops ${table} but has no probe to prevent re-running`,
      ).toBe(true);
    }
  });

  it("keeps the anti-rollback floor out of the cache table", () => {
    // Deleting the cache must cost a re-fetch, never the rollback floor: if
    // one delete cleared both, an attacker would disable anti-rollback and
    // then replay a genuinely-signed older bundle.
    // Statements are separate array entries; pick them rather than slicing
    // joined text (an earlier version cut at the ")" inside CHECK (id = 1)).
    const statements = stateSchemaStatements(0);
    const cache = statements.filter((sql) => sql.startsWith("CREATE TABLE definitions_cache")).at(-1);
    expect(cache).toBeDefined();
    expect(cache).not.toContain("highest_bundle_number");
    expect(
      statements.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS definitions_history")),
    ).toBe(true);
    // And the cache must carry what re-verification needs: the exact signed
    // bytes AND the detached signature.
    expect(cache).toContain("payload_b64");
    expect(cache).toContain("signature_b64");
  });

  it("splits into individually executable statements", () => {
    // Rust executes these one at a time, so none may be a multi-statement blob
    // and none may be blank.
    for (const statement of stateSchemaStatements(0)) {
      expect(statement.trim().length).toBeGreaterThan(0);
      expect(statement.replace(/;\s*$/, "")).not.toContain(";");
    }
  });
});
