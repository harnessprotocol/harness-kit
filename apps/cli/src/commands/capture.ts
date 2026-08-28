import { basename, resolve } from "node:path";
import { stringify } from "yaml";
import {
  applyFileTransaction,
  importProjectValidated,
  parseHarness,
  sanitizeCapturedSecrets,
  validateHarness,
} from "@harness-kit/core";
import type { HarnessScope } from "@harness-kit/core";
import { NodeFsProvider } from "@harness-kit/core/node";
import { readOptional, relativeInside, timestamp } from "./portability-common.js";

interface CaptureFlags {
  scope?: HarnessScope;
  output?: string;
  dryRun?: boolean;
  yes?: boolean;
  force?: boolean;
  json?: boolean;
}

export async function captureCommand(flags: CaptureFlags): Promise<void> {
  const scope = flags.scope ?? "project";
  if (!["personal", "project", "session"].includes(scope)) {
    throw new Error(`unsupported capture scope '${scope}'; expected personal, project, or session`);
  }
  const hostFs = new NodeFsProvider();
  const root = scope === "personal" ? await hostFs.homedir() : resolve(".");
  const defaultOutput = scope === "personal" ? resolve(root, ".harness/harness.yaml") : resolve(root, "harness.yaml");
  const output = resolve(flags.output ?? defaultOutput);
  const fs = new NodeFsProvider(root);
  const before = await readOptional(output);
  const captured = await importProjectValidated({
    fs,
    name: basename(root),
    description: `Captured ${scope} harness configuration.`,
  });
  let prior: ReturnType<typeof parseHarness>["config"] | null = null;
  if (before) {
    try {
      const parsed = parseHarness(before).config;
      if (validateHarness(parsed).valid) prior = parsed;
    } catch {
      // Invalid prior files are never merged into a capture.
    }
  }
  const merged = prior
    ? {
        ...prior,
        ...captured.harnessConfig,
        version: "2" as const,
        scope,
        metadata: prior.metadata ?? captured.harnessConfig.metadata,
        ...(prior.plugins ? { plugins: prior.plugins } : {}),
        ...(prior.env ? { env: prior.env } : {}),
        ...(prior["architectural-constraints"] ? { "architectural-constraints": prior["architectural-constraints"] } : {}),
        ...(prior.policy ? { policy: prior.policy } : {}),
        ...(prior.extends ? { extends: prior.extends } : {}),
      }
    : { ...captured.harnessConfig, version: "2" as const, scope };
  const sanitized = sanitizeCapturedSecrets(merged);
  const yaml = stringify(sanitized.config, { lineWidth: 0 });

  const preview = {
    scope,
    output,
    adapters: captured.findings.adapters.filter((adapter) => adapter.detected || adapter.found.length > 0),
    conflicts: captured.provenance.conflicts,
    credentialReferencesCreated: sanitized.findings,
    changed: before !== yaml,
  };
  if (flags.json) console.log(JSON.stringify(preview, null, 2));
  else {
    console.log(`Capture ${scope}: ${preview.adapters.length} harness adapter(s), ${sanitized.findings.length} credential value(s) externalized.`);
    console.log(`${flags.yes && !flags.dryRun ? "Output" : "Would write"}: ${output}`);
  }
  if (flags.dryRun || !flags.yes || before === yaml) return;
  if (before !== null && !flags.force) {
    throw new Error(`${output} exists; preview with --dry-run or replace it with --force`);
  }

  const result = await applyFileTransaction(
    [{ path: relativeInside(root, output), before, after: yaml }],
    { fs, timestamp: timestamp() },
  );
  if (!result.committed) throw new Error(result.error ?? "capture transaction failed");
  if (!flags.json) console.log(`Captured to ${output}; rollback manifest: ${resolve(root, result.manifestPath)}`);
}
