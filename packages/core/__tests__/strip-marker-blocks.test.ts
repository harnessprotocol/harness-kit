import { describe, it, expect } from "vitest";
import {
  stripHarnessMarkerBlocks,
  isEntirelyMarkerGenerated,
} from "../src/import/read-instructions.js";

const B = (name: string, slot: string) => `<!-- BEGIN harness:${name}:${slot} -->`;
const E = (name: string, slot: string) => `<!-- END harness:${name}:${slot} -->`;

describe("stripHarnessMarkerBlocks", () => {
  it("leaves content without markers untouched", () => {
    expect(stripHarnessMarkerBlocks("# Proj\n\nprose\n")).toBe("# Proj\n\nprose\n");
    expect(stripHarnessMarkerBlocks("")).toBe("");
  });

  it("removes a block and keeps the prose around it", () => {
    const content = `intro\n${B("a", "b")}\ngenerated\n${E("a", "b")}\noutro\n`;
    expect(stripHarnessMarkerBlocks(content)).toBe("intro\noutro\n");
  });

  it("removes every block, including repeats of the same tag", () => {
    const content = `${B("a", "b")}\n1\n${E("a", "b")}\nmid\n${B("a", "b")}\n2\n${E("a", "b")}\n`;
    expect(stripHarnessMarkerBlocks(content)).toBe("mid\n");
  });

  it("pairs a BEGIN with its own tag's END, swallowing anything between", () => {
    // The a:b block spans the nested B(c,d), so c:d's BEGIN goes with it and its
    // END is left behind as an orphan — markers are not treated as nestable.
    const content = `${B("a", "b")}\n${B("c", "d")}\n${E("a", "b")}\n${E("c", "d")}\n`;
    expect(stripHarnessMarkerBlocks(content)).toBe(`${E("c", "d")}\n`);
  });

  it("keeps a trailing newline when the block runs to EOF unterminated by one", () => {
    const content = `intro\n${B("a", "b")}\ngen\n${E("a", "b")}`;
    expect(stripHarnessMarkerBlocks(content)).toBe("intro\n");
  });

  it("leaves an unterminated BEGIN, an orphan END, and mismatched tags in place", () => {
    expect(stripHarnessMarkerBlocks(`${B("a", "b")}\nstuff\n`)).toBe(`${B("a", "b")}\nstuff\n`);
    expect(stripHarnessMarkerBlocks(`${E("a", "b")}\nstuff\n`)).toBe(`${E("a", "b")}\nstuff\n`);
    const mismatched = `${B("a", "b")}\nstuff\n${E("c", "d")}\n`;
    expect(stripHarnessMarkerBlocks(mismatched)).toBe(mismatched);
  });

  // Regression: the old single-regex implementation lazily scanned ahead for an
  // END from every BEGIN, so N unterminated BEGIN lines cost O(N^2)
  // (CodeQL js/polynomial-redos). Instruction files are attacker-adjacent input
  // during `harness import`, so the strip must stay linear.
  it("stays linear on many unterminated BEGIN lines", () => {
    const evil = `${B("9", "!")}\n`.repeat(40_000);
    const started = performance.now();
    expect(stripHarnessMarkerBlocks(evil)).toBe(evil);
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});

describe("isEntirelyMarkerGenerated", () => {
  it("is true when only marker blocks remain", () => {
    expect(isEntirelyMarkerGenerated(`${B("a", "b")}\ngen\n${E("a", "b")}\n`)).toBe(true);
  });

  it("is false when real prose survives the strip", () => {
    expect(isEntirelyMarkerGenerated(`${B("a", "b")}\ngen\n${E("a", "b")}\nmine\n`)).toBe(false);
  });
});
