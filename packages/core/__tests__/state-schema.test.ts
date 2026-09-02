import { describe, expect, it } from "vitest";
import { STATE_SCHEMA_VERSION, stateSchemaStatements } from "../src/state/schema.js";

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

  it("splits into individually executable statements", () => {
    // Rust executes these one at a time, so none may be a multi-statement blob
    // and none may be blank.
    for (const statement of stateSchemaStatements(0)) {
      expect(statement.trim().length).toBeGreaterThan(0);
      expect(statement.replace(/;\s*$/, "")).not.toContain(";");
    }
  });
});
