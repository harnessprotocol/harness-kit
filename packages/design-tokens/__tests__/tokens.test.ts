import { describe, it, expect } from "vitest";
import { palette, CSS_VARS, cssVarBlock } from "../src/tokens.js";

// design-tokens is the single source of truth for the shared color identity; both the
// desktop app and website consume generated CSS var blocks. These guard against the
// token map drifting out of sync with the CSS var emitter.
describe("design tokens", () => {
  it("CSS_VARS covers exactly the ModeTokens keys (no missing or extra mappings)", () => {
    const tokenKeys = Object.keys(palette.light).sort();
    const mappedKeys = CSS_VARS.map(([key]) => key).sort();
    expect(mappedKeys).toEqual(tokenKeys);
  });

  it("every CSS var name is a unique --kebab-case custom property", () => {
    const names = CSS_VARS.map(([, name]) => name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^--[a-z]+(-[a-z]+)*$/);
    }
  });

  it("light and dark modes define the same token keys", () => {
    expect(Object.keys(palette.light).sort()).toEqual(Object.keys(palette.dark).sort());
  });

  it("no token value is empty", () => {
    for (const mode of [palette.light, palette.dark]) {
      for (const [key, value] of Object.entries(mode)) {
        expect(value, `${key} must be a non-empty color`).toBeTruthy();
      }
    }
  });

  it("cssVarBlock emits one declaration per token with the mode's values", () => {
    const block = cssVarBlock(palette.dark);
    const lines = block.split("\n");
    expect(lines).toHaveLength(CSS_VARS.length);
    for (const [key, name] of CSS_VARS) {
      expect(block).toContain(`${name}: ${palette.dark[key]};`);
    }
  });
});
