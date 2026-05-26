/**
 * Writes the canonical token block (from tokens.ts) into each consumer's CSS
 * between named markers, so the desktop app and the website can never drift.
 *
 * Each consumer must contain two marker pairs — one for light (:root), one for
 * dark (.dark):
 *   {@literal /* design-tokens:light:start *\/} ... {@literal /* design-tokens:light:end *\/}
 *   {@literal /* design-tokens:dark:start  *\/} ... {@literal /* design-tokens:dark:end  *\/}
 *
 * Run: pnpm --filter @harness-kit/design-tokens generate
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { palette, cssVarBlock } from "./tokens.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

const TARGETS = [
  resolve(repoRoot, "apps/desktop/src/app.css"),
  resolve(repoRoot, "website/app/global.css"),
];

const NOTE = "  /* generated — edit packages/design-tokens/src/tokens.ts, then run generate */";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inject(css: string, mode: "light" | "dark", body: string, file: string): string {
  const start = `/* design-tokens:${mode}:start */`;
  const end = `/* design-tokens:${mode}:end */`;
  const re = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`);
  if (!re.test(css)) {
    throw new Error(`Missing ${mode} markers in ${file}. Add "${start}" / "${end}" inside the ${mode === "light" ? ":root" : ".dark"} block.`);
  }
  return css.replace(re, `${start}\n${NOTE}\n${body}\n  ${end}`);
}

let changed = 0;
for (const file of TARGETS) {
  const before = readFileSync(file, "utf8");
  let after = before;
  after = inject(after, "light", cssVarBlock(palette.light), file);
  after = inject(after, "dark", cssVarBlock(palette.dark), file);
  if (after !== before) {
    writeFileSync(file, after);
    changed++;
    console.log(`updated ${file.replace(repoRoot + "/", "")}`);
  } else {
    console.log(`unchanged ${file.replace(repoRoot + "/", "")}`);
  }
}
console.log(`design-tokens: ${changed} file(s) updated.`);
