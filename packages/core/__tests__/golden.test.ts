import { describe, it, expect } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { compile } from "../src/compile/compile.js";
import type { TargetPlatform } from "../src/types.js";
import { MockFsProvider } from "./helpers/mock-fs.js";

/**
 * WP-2.1 regression net.
 *
 * Captures the exact byte output of `compile()` across every existing target,
 * for every fixture harness.yaml, BEFORE the adapter/registry refactor. After
 * the refactor, the same compilation must reproduce these bytes exactly.
 *
 * Golden files live in packages/core/fixtures/golden/ and are committed.
 *
 * To (re)capture goldens (only do this deliberately, never to "fix" a failing
 * diff): `UPDATE_GOLDEN=1 pnpm --filter @harness-kit/core test golden`
 */

const FIXTURES = resolve(import.meta.dirname, "fixtures");
const GOLDEN_DIR = resolve(import.meta.dirname, "..", "fixtures", "golden");

const ALL_TARGETS: TargetPlatform[] = [
  "claude-code",
  "cursor",
  "copilot",
  "codex",
  "opencode",
  "windsurf",
  "gemini",
  "junie",
];

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES, name), "utf-8");
}

interface GoldenSnapshot {
  fixture: string;
  targets: TargetPlatform[];
  harnessName: string;
  warnings: string[];
  skippedPlugins: string[];
  files: Array<{
    path: string;
    platform: TargetPlatform;
    slot: string;
    action: string;
    content: string;
  }>;
}

/** Cases we snapshot: every target individually, plus the "all targets" case. */
const CASES: Array<{ id: string; fixture: string; targets: TargetPlatform[] }> = [
  { id: "all-targets", fixture: "valid-harness.yaml", targets: ALL_TARGETS },
  ...ALL_TARGETS.map((t) => ({
    id: `single-${t}`,
    fixture: "valid-harness.yaml",
    targets: [t],
  })),
];

async function runCase(caseDef: (typeof CASES)[number]): Promise<GoldenSnapshot> {
  const fs = new MockFsProvider();
  const yaml = loadFixture(caseDef.fixture);

  const result = await compile(yaml, caseDef.targets, fs, { dryRun: true });

  // Sort deterministically so unrelated ordering changes in the refactor
  // don't produce spurious diffs — only content/path/platform/slot/action matter.
  const files = [...result.files]
    .sort((a, b) => {
      if (a.path !== b.path) return a.path.localeCompare(b.path);
      if (a.platform !== b.platform) return a.platform.localeCompare(b.platform);
      return a.slot.localeCompare(b.slot);
    })
    .map((f) => ({
      path: f.path,
      platform: f.platform,
      slot: f.slot,
      action: f.action,
      content: f.content,
    }));

  return {
    fixture: caseDef.fixture,
    targets: caseDef.targets,
    harnessName: result.harnessName,
    warnings: [...result.warnings].sort(),
    skippedPlugins: [...result.skippedPlugins].sort(),
    files,
  };
}

function goldenPath(id: string): string {
  return resolve(GOLDEN_DIR, `${id}.json`);
}

const UPDATE = process.env.UPDATE_GOLDEN === "1";

describe("golden output regression (WP-2.1)", () => {
  if (UPDATE) {
    mkdirSync(GOLDEN_DIR, { recursive: true });
  }

  for (const caseDef of CASES) {
    it(`matches golden output: ${caseDef.id}`, async () => {
      const snapshot = await runCase(caseDef);
      const path = goldenPath(caseDef.id);
      const serialized = JSON.stringify(snapshot, null, 2) + "\n";

      if (UPDATE || !existsSync(path)) {
        writeFileSync(path, serialized);
        return;
      }

      const golden = readFileSync(path, "utf-8");
      expect(serialized).toBe(golden);
    });
  }
});
