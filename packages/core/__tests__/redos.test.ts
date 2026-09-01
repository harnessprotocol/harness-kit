import { describe, expect, it } from "vitest";
import { homeWriteScope, isWritableHomePath } from "../src/surfaces/write-scope.js";

/**
 * Both paths previously used regexes CodeQL flagged as polynomial-backtracking
 * (js/polynomial-redos). These inputs are the adversarial shapes: long runs of
 * the repeated character with no match at the end.
 */
describe("ReDoS resistance", () => {
  it("normalizes a long slash run in linear time", () => {
    const scope = homeWriteScope("darwin");
    const hostile = `${"/".repeat(50_000)}x`;
    const started = performance.now();
    expect(isWritableHomePath(hostile, scope)).toBe(false);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("handles a long trailing-slash run", () => {
    const scope = homeWriteScope("darwin");
    const hostile = `.claude.json${"/".repeat(50_000)}`;
    const started = performance.now();
    isWritableHomePath(hostile, scope);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
