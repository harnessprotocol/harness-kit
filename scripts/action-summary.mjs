#!/usr/bin/env node
// Renders the harness-kit GitHub Action job summary (markdown) to stdout.
//
// Usage: node action-summary.mjs <check|status> <stdout-file> <stderr-file> <exit-code>
//
// <stdout-file> holds the CLI's --json output, <stderr-file> its stderr.
// Never throws: unreadable or non-JSON output becomes a plain failure summary.
import { readFileSync } from "node:fs";
import { relative } from "node:path";

const [command = "check", stdoutPath, stderrPath, exitArg = "0"] = process.argv.slice(2);
const exitCode = Number(exitArg);

function read(path) {
  if (!path) return "";
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return "";
  }
}

function parseJson(text) {
  // The CLI prints one JSON document; tolerate leading log lines.
  for (const candidate of [text, text.split("\n").filter((l) => l.startsWith("{")).pop() ?? ""]) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function cell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function table(headers, rows) {
  const lines = [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`];
  for (const row of rows) lines.push(`| ${row.map(cell).join(" | ")} |`);
  return lines.join("\n");
}

function checkSummary(data) {
  const out = [`## harness check`, ""];
  if (data.error) {
    out.push(`Failed: ${data.error}`);
    return out;
  }
  const changes = data.changes ?? [];
  const bad = changes.filter((c) => c.status !== "ok");
  if (data.drifted) {
    out.push(`Drift found: ${bad.length} of ${changes.length} compiled files are out of date or missing.`);
    out.push("", "Run `harness compile` locally and commit the result.");
  } else if (changes.length === 0) {
    out.push("Nothing to check. No skills or instructions are configured.");
  } else {
    out.push(`In sync: ${changes.length} of ${changes.length} compiled files match harness.yaml.`);
  }
  if (changes.length > 0) {
    out.push("", table(["Kind", "Name", "Target", "Status"], changes.map((c) => [c.kind, c.name, c.target, c.status])));
  }
  return out;
}

function statusSummary(data) {
  const out = [`## harness status`, ""];
  const s = data.summary;
  if (s) {
    out.push(
      `In sync: ${s.inSync}, drift: ${s.drift}, not configured: ${s.notConfigured}, not installed: ${s.notInstalled}.`,
    );
  }
  const driftRows = [];
  for (const row of data.rows ?? []) {
    for (const [scope, c] of Object.entries(row.cells ?? {})) {
      if (c.status === "drift") driftRows.push([row.adapter, relative(process.cwd(), scope) || ".",`${c.driftCount} item(s)`, c.detail]);
    }
  }
  if (driftRows.length > 0) {
    out.push("", table(["Harness", "Scope", "Drift", "Detail"], driftRows));
  }
  if (data.reconciliation?.blocked) {
    out.push("", "Reconciliation has unresolved conflicts.");
  }
  const recs = data.recommendations ?? [];
  if (recs.length > 0) {
    out.push("", "### Recommendations", "");
    for (const r of recs) out.push(`- ${r.summary}`);
  }
  return out;
}

const stdout = read(stdoutPath);
const stderr = read(stderrPath);
const data = parseJson(stdout);

let lines;
if (data && command === "check") lines = checkSummary(data);
else if (data && command === "status") lines = statusSummary(data);
else {
  lines = [`## harness ${command}`, "", `Failed with exit code ${exitCode} and no readable output.`];
}

if (exitCode !== 0 && lines.length <= 3 && stderr) {
  lines.push("", "```", stderr.split("\n").slice(-20).join("\n"), "```");
}

console.log(lines.join("\n"));
