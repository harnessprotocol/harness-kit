import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AC-60, webview half of the IPC contract. Each file in test-fixtures/ipc holds
 * the exact payload a tauri.ts wrapper sends for one command. This test runs the
 * wrapper and asserts the payload equals the fixture; the Rust test
 * (commands/ipc_contract.rs) deserializes the same fixture against the real
 * command signature. Change one side without the other and a gate fails.
 */
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "../../../test-fixtures/ipc");
const tauriTs = join(here, "../tauri.ts");

interface Call {
  fn: string;
  args: unknown[];
  payload: Record<string, unknown> | null;
}
interface Fixture {
  command: string;
  calls: Call[];
}

const fixtures: Fixture[] = readdirSync(fixtureDir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(fixtureDir, f), "utf8")) as Fixture);

const wrappers = (await import("../tauri")) as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;

describe("IPC payload fixtures", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(null);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("has a fixture for every command tauri.ts invokes, and none for a command it does not", () => {
    const source = readFileSync(tauriTs, "utf8");
    const invoked = new Set(
      [...source.matchAll(/\binvoke\s*(?:<[^>]*>)?\s*\(\s*"([a-z_0-9]+)"/g)].map((m) => m[1]),
    );
    expect(fixtures.map((f) => f.command).sort()).toEqual([...invoked].sort());
  });

  for (const fixture of fixtures) {
    describe(fixture.command, () => {
      it("has at least one call", () => {
        expect(fixture.calls.length).toBeGreaterThan(0);
      });
      for (const [i, call] of fixture.calls.entries()) {
        it(`${call.fn}() sends exactly the fixture payload (#${i + 1})`, async () => {
          const fn = wrappers[call.fn];
          expect(fn, `tauri.ts no longer exports ${call.fn}`).toBeTypeOf("function");
          await fn(...call.args);
          expect(invoke).toHaveBeenCalledTimes(1);
          const [command, sent] = invoke.mock.calls[0] as [string, unknown];
          expect(command).toBe(fixture.command);
          // The IPC layer serializes to JSON: undefined keys are dropped, so compare after the round trip.
          const wire = sent === undefined ? null : JSON.parse(JSON.stringify(sent));
          expect(wire).toEqual(call.payload);
        });
      }
    });
  }
});
