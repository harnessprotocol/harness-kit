import { describe, it, expect } from "vitest";
// @ts-expect-error — plain .mjs lint script, no types needed
import { lintSource } from "../../scripts/lint-page-styles.mjs";

type Finding = { file: string; line: number; rule: string; message: string };
const lint = (text: string): Finding[] => lintSource("src/pages/X.tsx", text);

describe("lint-page-styles: color-literal", () => {
  it.each([
    ['const s = { color: "#d97706" };', "hex"],
    ['const s = { background: "rgba(0,0,0,.1)" };', "rgba"],
    ['const s = { color: "hsl(10 20% 30%)" };', "hsl"],
    ['const s = { color: "#fff" };', "short hex"],
    ["const s = { color: `#d97706` };", "template literal"],
    ['const s = { color: "var(--danger, #e53e3e)" };', "var fallback"],
  ])("flags %s (%s)", (src) => {
    const found = lint(src);
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe("color-literal");
    expect(found[0].file).toBe("src/pages/X.tsx");
  });

  it.each([
    'const s = { color: "var(--accent)" };',
    'const s = { background: "color-mix(in srgb, var(--accent) 12%, transparent)" };',
    "// #fff in a comment\nconst a = 1;",
    "/* rgba(0,0,0,1) */\nconst a = 1;",
    'const id = "#section-2";',
    'const id = "#add-item";',
  ])("does not flag %s", (src) => {
    expect(lint(src)).toEqual([]);
  });

  it("reports the line of the literal", () => {
    const found = lint('const a = 1;\nconst b = 2;\nconst s = {\n  color: "#d97706",\n};');
    expect(found.map((f) => f.line)).toEqual([4]);
  });

  it("reports the line inside a multi-line template", () => {
    const found = lint("const css = `\n  a { }\n  b { color: #d97706; }\n`;");
    expect(found.map((f) => f.line)).toEqual([3]);
  });

  it("reports each literal separately", () => {
    const found = lint('const s = ["#111", "#222"];\nconst t = "rgba(0,0,0,.5)";');
    expect(found.map((f) => f.line)).toEqual([1, 1, 2]);
  });
});
