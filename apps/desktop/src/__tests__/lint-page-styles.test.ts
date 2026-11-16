import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-expect-error — plain .mjs lint script, no types needed
import { lintSource, MODAL_OVERLAY_ALLOWLIST } from "../../scripts/lint-page-styles.mjs";

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

describe("lint-page-styles: modal-overlay", () => {
  it("flags aria-modal in a desktop file", () => {
    const found = lint('export const A = () => <div role="dialog" aria-modal="true" />;');
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe("modal-overlay");
  });

  it("does not flag the shared Modal or the word in text", () => {
    expect(lint('export const A = () => <Modal open onClose={f} title="x">y</Modal>;')).toEqual([]);
    expect(lint('const s = "aria-modal";')).toEqual([]);
  });

  it("skips an allowlisted file", () => {
    const path = Object.keys(MODAL_OVERLAY_ALLOWLIST)[0];
    expect(lintSource(path, '<div aria-modal="true" />')).toEqual([]);
  });

  it("keeps every allowlist entry live: file exists, still has aria-modal, has a reason", () => {
    const root = resolve(__dirname, "../..");
    for (const [file, reason] of Object.entries(MODAL_OVERLAY_ALLOWLIST) as [string, string][]) {
      expect(reason.length, `${file} needs a reason`).toBeGreaterThan(10);
      const full = resolve(root, file);
      expect(existsSync(full), `${file} no longer exists`).toBe(true);
      expect(readFileSync(full, "utf8"), `${file} no longer has aria-modal`).toContain("aria-modal");
    }
  });
});

describe("lint-page-styles: title-attribute", () => {
  it("flags title on an intrinsic element", () => {
    const found = lint('export const A = () => <button title="x">y</button>;');
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe("title-attribute");
  });

  it("flags a multi-line element with an expression title", () => {
    const found = lint("export const A = () => (\n  <div\n    className=\"a\"\n    title={y}\n  />\n);");
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe("title-attribute");
    expect(found[0].line).toBe(4);
  });

  it("does not flag component props or svg title elements", () => {
    expect(lint('export const A = () => <Modal open onClose={f} title="x">y</Modal>;')).toEqual([]);
    expect(lint('export const A = () => <EmptyState title="x" />;')).toEqual([]);
    expect(lint("export const A = () => <svg><title>Icon</title></svg>;")).toEqual([]);
  });
});
