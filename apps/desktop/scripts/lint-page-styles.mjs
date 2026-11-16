#!/usr/bin/env node
// lint-page-styles.mjs
//
// Style lint for desktop page code (src/pages, src/components, src/layouts).
// Colours come from design tokens (CSS variables), never literals, so light and
// dark themes stay in step.
//
// Rules (add new ones as functions in RULES; each returns LintFinding[]):
//   color-literal  hex, rgb(a) and hsl(a) values in string or template text
//   modal-overlay  an `aria-modal` JSX attribute: dialogs use @harness-kit/ui Modal
//   title-attribute  a `title` attribute on a lowercase (intrinsic) JSX element: use
//                    @harness-kit/ui Tooltip. Component props named `title` pass.
//
// `lintSource(path, text)` is exported so the rules are unit-tested (see
// src/__tests__/lint-page-styles.test.ts). Run as a CLI it walks the source
// roots, prints `file:line rule message`, and exits 1 on any finding.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * @typedef {{ file: string, line: number,
 *   rule: "color-literal" | "modal-overlay" | "title-attribute",
 *   message: string }} LintFinding
 */

// Hex only when the whole token is hex ("#section-2" and "#add-item" pass).
const COLOR_RE = /(?<![\w&#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])|\b(?:rgba?|hsla?)\(/g;

/** Nodes whose text can hold a colour: string literals and template pieces. */
function isTextNode(node) {
  return (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
  );
}

/** @returns {LintFinding[]} */
function colorLiteralRule(file, sf) {
  const findings = [];
  const visit = (node) => {
    if (isTextNode(node)) {
      const start = node.getStart(sf);
      const raw = node.getText(sf);
      for (const m of raw.matchAll(COLOR_RE)) {
        const { line } = sf.getLineAndCharacterOfPosition(start + m.index);
        findings.push({
          file,
          line: line + 1,
          rule: "color-literal",
          message: `colour literal "${m[0]}": use a design token (var(--...)), or color-mix() of one for transparency`,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}

/**
 * Files that keep their own `aria-modal` on purpose, each with its reason.
 * A test fails if an entry's file is gone or no longer has `aria-modal`.
 */
export const MODAL_OVERLAY_ALLOWLIST = {
  "src/components/CommandPalette.tsx":
    "Top-aligned keyboard-driven palette; does not fit Modal's title, body and footer shape.",
  "src/pages/onboarding/OnboardingFlow.tsx":
    "First-run full-window takeover, not a modal; skip must be deliberate (AC-33).",
};

/** @returns {LintFinding[]} */
function modalOverlayRule(file, sf) {
  if (Object.hasOwn(MODAL_OVERLAY_ALLOWLIST, file.replaceAll("\\", "/"))) return [];
  const findings = [];
  const visit = (node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(sf) === "aria-modal") {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      findings.push({
        file,
        line: line + 1,
        rule: "modal-overlay",
        message: "custom dialog overlay: use <Modal> from @harness-kit/ui",
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}

/** @returns {LintFinding[]} */
function titleAttributeRule(file, sf) {
  const findings = [];
  const visit = (node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(sf) === "title") {
      const element = node.parent.parent;
      const tag = (ts.isJsxOpeningElement(element) || ts.isJsxSelfClosingElement(element))
        ? element.tagName.getText(sf)
        : "";
      if (/^[a-z]/.test(tag)) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        findings.push({
          file,
          line: line + 1,
          rule: "title-attribute",
          message: `title attribute on <${tag}>: use <Tooltip> from @harness-kit/ui (and aria-label on icon-only buttons)`,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}

const RULES = [colorLiteralRule, modalOverlayRule, titleAttributeRule];

/**
 * @param {string} path
 * @param {string} text
 * @returns {LintFinding[]}
 */
export function lintSource(path, text) {
  const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  return RULES.flatMap((rule) => rule(path, sf)).sort((a, b) => a.line - b.line);
}

const SKIP_DIRS = new Set(["__tests__", "__fixtures__"]);

function* walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) yield* walk(full);
    } else if (/\.tsx?$/.test(name) && !name.endsWith(".d.ts")) {
      yield full;
    }
  }
}

function runCli() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const findings = [];
  for (const sub of ["src/pages", "src/components", "src/layouts"]) {
    for (const file of walk(join(root, sub))) {
      findings.push(...lintSource(relative(root, file), readFileSync(file, "utf8")));
    }
  }
  for (const f of findings) console.error(`${f.file}:${f.line} ${f.rule} ${f.message}`);
  if (findings.length) {
    console.error(`\nlint:styles found ${findings.length} problem(s).`);
    process.exit(1);
  }
  console.log("lint:styles OK");
}

// Only run the CLI when executed directly, not when imported by tests.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
