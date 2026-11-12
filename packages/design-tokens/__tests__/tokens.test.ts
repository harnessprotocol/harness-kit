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

  // WCAG AA (AC-61): 4.5:1 for body text, against the real backgrounds.
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const mixOn = (fg: string, bg: string, alpha: number) =>
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(parseInt(fg.slice(i, i + 2), 16) * alpha + parseInt(bg.slice(i, i + 2), 16) * (1 - alpha))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("");
  const STATUS_BASE = { successText: "#3fb07a", warningText: "#e0a33d", dangerText: "#f2555a" } as const;

  for (const [name, mode, tint] of [
    ["light", palette.light, 0.1],
    ["dark", palette.dark, 0.16],
  ] as const) {
    it(`${name}: fg-subtle meets 4.5:1 on base, surface and elevated`, () => {
      for (const bg of [mode.bgBase, mode.bgSurface, mode.bgElevated]) {
        expect(ratio(mode.fgSubtle, bg)).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`${name}: fg-placeholder meets 4.5:1 on base and surface`, () => {
      for (const bg of [mode.bgBase, mode.bgSurface]) {
        expect(ratio(mode.fgPlaceholder, bg)).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`${name}: status text meets 4.5:1 on its own tint over every surface`, () => {
      for (const [key, base] of Object.entries(STATUS_BASE)) {
        for (const bg of [mode.bgBase, mode.bgSurface, mode.bgElevated]) {
          const fg = mode[key as keyof typeof STATUS_BASE];
          expect(ratio(fg, mixOn(base, bg, tint)), `${key} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
    it(`${name}: white text on the primary fill meets 4.5:1`, () => {
      expect(ratio("#FFFFFF", mode.accentFill)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("cssVarBlock emits one declaration per token with the mode's values", () => {
    const block = cssVarBlock(palette.dark);
    const lines = block.split("\n");
    expect(lines).toHaveLength(CSS_VARS.length);
    for (const [key, name] of CSS_VARS) {
      expect(block).toContain(`${name}: ${palette.dark[key]};`);
    }
  });
});
