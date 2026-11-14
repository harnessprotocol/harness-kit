#!/usr/bin/env node
// Fails when a tracked file contains a whole credential-shaped string.
//
// Test fixtures for the secret scrubber need token-shaped values. Written
// whole, they look like leaks to secret scanners and to anyone scanning this
// public repo. Build them at run time with `fakeSecret(prefix, body)` instead:
//   packages/core/__tests__/helpers/fake-secret.ts
//   apps/desktop/src/test-utils/fake-secret.ts
//
// Prints the file, line and token kind, never the matched text.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SHAPES = [
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{20,}/],
  ["GitHub fine-grained PAT", /\bgithub_pat_[A-Za-z0-9_]{20,}/],
  ["GitLab token", /\bglpat-[A-Za-z0-9_-]{20,}/],
  ["npm token", /\bnpm_[A-Za-z0-9]{36}/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Stripe key", /\b[sr]k_live_[A-Za-z0-9]{10,}/],
  ["Anthropic/OpenAI key", /\bsk-(?:ant|proj)-[A-Za-z0-9_-]{20,}/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["Slack webhook", /hooks\.slack\.com\/services\/T[A-Za-z0-9]+\/B[A-Za-z0-9]+\/[A-Za-z0-9]+/],
  ["Discord webhook", /discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/],
  ["Private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

const SELF = "scripts/check-token-literals.mjs";
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter((f) => f && f !== SELF);

const hits = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue; // deleted in the working tree, or unreadable
  }
  if (text.includes("\0")) continue; // binary
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    for (const [kind, re] of SHAPES) {
      if (re.test(line)) hits.push(`${file}:${i + 1}: ${kind}`);
    }
  });
}

if (hits.length) {
  console.error("Credential-shaped strings found in tracked files:\n  " + hits.join("\n  "));
  console.error("\nIf it is a test fixture, build it with fakeSecret(prefix, body). If it is real, rotate it.");
  process.exit(1);
}
console.log(`No credential-shaped strings in ${files.length} tracked files.`);
