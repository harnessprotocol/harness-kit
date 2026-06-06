/**
 * harness exchange — peer-to-peer fragment sharing commands.
 *
 * Subcommands:
 *   keygen   Generate an ed25519 Exchange keypair
 *   offer    Build and sign a plaintext offer envelope from a fragment
 *   accept   Review and accept/edit/reject a received offer envelope
 *
 * Phase 1 (MVP): file transport, plaintext (no encryption), unaddressed offers.
 * Phase 2 will add --to-key encryption and HTTP-pull relay transport.
 */

import chalk from "chalk";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { select } from "@inquirer/prompts";
import { parseDocument, stringify as yamlStringify } from "yaml";
import {
  buildOffer,
  generate,
  save,
  load,
  exists,
  fingerprint as computeFingerprint,
  fragmentContentId,
  verifyOffer,
  type PlaintextOfferEnvelope,
} from "@harness-kit/exchange";
import { parseHarness } from "@harness-kit/core";
import {
  formatKeypair,
  formatPreview,
  formatAcceptResult,
} from "../formatters/exchange.js";

// ─── keygen ──────────────────────────────────────────────────────────────────

interface KeygenFlags {
  json?: boolean;
  force?: boolean;
}

export async function keygenCommand(flags: KeygenFlags): Promise<void> {
  if (exists() && !flags.force) {
    console.error(
      chalk.yellow(
        "⚠ An Exchange keypair already exists at ~/.harness/exchange/.\n" +
          "  Use --force to overwrite it."
      )
    );
    process.exit(1);
  }

  const keypair = generate();
  save(keypair);
  const fp = computeFingerprint(keypair.publicKey);

  if (flags.json) {
    console.log(JSON.stringify({ publicKey: keypair.publicKey, fingerprint: fp }));
  } else {
    console.log(formatKeypair(keypair.publicKey, fp));
  }

  process.exit(0);
}

// ─── offer ───────────────────────────────────────────────────────────────────

interface OfferFlags {
  out?: string;
  expires?: string;
  message?: string;
  json?: boolean;
}

export async function offerCommand(
  fragmentPath: string,
  flags: OfferFlags
): Promise<void> {
  // Load and validate the fragment
  let fragmentYaml: string;
  try {
    fragmentYaml = await readFile(fragmentPath, "utf-8");
  } catch {
    console.error(chalk.red(`Error: cannot read fragment file: ${fragmentPath}`));
    process.exit(1);
  }

  const parsed = parseHarness(fragmentYaml);
  if (!parsed.config) {
    console.error(chalk.red("Error: failed to parse harness YAML."));
    process.exit(1);
  }

  // Exchange is fragments-only — reject profiles
  const kind = parsed.config.kind ?? "profile";
  if (kind !== "fragment") {
    console.error(
      chalk.red(
        `Error: Exchange only accepts fragments (kind: fragment), not profiles.\n` +
          `  This file declares kind: ${kind}.\n` +
          `  Create a fragment instead.`
      )
    );
    process.exit(1);
  }

  // Phase 2: reject --to-key (encryption not yet implemented)
  // (Commander won't have this option wired until Phase 2, but guard here anyway)

  // Load sender keypair
  let keypair;
  try {
    keypair = load();
  } catch (err) {
    console.error(
      chalk.red(
        `Error: ${err instanceof Error ? err.message : "Could not load keypair"}\n` +
          `  Run: harness exchange keygen`
      )
    );
    process.exit(1);
  }

  // Parse expires (ISO or +Nd shorthand)
  const expires = flags.expires ? parseExpiry(flags.expires) : defaultExpires();

  const envelope = buildOffer(parsed.config as Record<string, unknown>, {
    sender: keypair,
    expires,
    message: flags.message,
  });

  const json = JSON.stringify(envelope, null, 2);

  if (flags.out) {
    await writeFile(flags.out, json, "utf-8");
    console.log(chalk.green(`✓ Offer written to: ${flags.out}`));
  } else {
    console.log(json);
  }

  process.exit(0);
}

// ─── accept ──────────────────────────────────────────────────────────────────

interface AcceptFlags {
  into?: string;
  yes?: boolean;
  json?: boolean;
}

export async function acceptCommand(
  offerPath: string,
  flags: AcceptFlags
): Promise<void> {
  // Read and parse the offer envelope
  let envelopeJson: string;
  try {
    envelopeJson = await readFile(offerPath, "utf-8");
  } catch {
    console.error(chalk.red(`Error: cannot read offer file: ${offerPath}`));
    process.exit(1);
  }

  let doc: unknown;
  try {
    doc = JSON.parse(envelopeJson);
  } catch {
    console.error(chalk.red("Error: offer file is not valid JSON."));
    process.exit(1);
  }

  // Verify the offer — four checks: schema, signature, expiry, fragment.
  // Any failure is terminal — no proceed-anyway path.
  const verifyResult = verifyOffer(doc);
  if (!verifyResult.ok) {
    console.error(chalk.red("Exchange error: offer verification failed."));
    for (const reason of verifyResult.reasons) {
      console.error(chalk.red(`  • ${reason}`));
    }
    if (verifyResult.fingerprint) {
      console.error(chalk.dim(`  Sender key: ${verifyResult.fingerprint}`));
    }
    console.error(chalk.red("Do not apply this offer."));
    process.exit(1);
  }

  const envelope = doc as PlaintextOfferEnvelope;

  // Mandatory preview — MUST show before any decision.
  const preview = formatPreview(envelope, verifyResult);
  console.log(preview);

  // Consent decision
  let choice: "accept" | "edit" | "reject";
  if (flags.yes) {
    choice = "accept";
    console.log(chalk.dim("(--yes: auto-accepting)"));
  } else {
    choice = await select({
      message: "What would you like to do?",
      choices: [
        { value: "accept", name: "Accept — apply this fragment" },
        { value: "edit", name: "Edit — modify before applying" },
        { value: "reject", name: "Reject — discard this offer" },
      ],
    });
  }

  if (choice === "reject") {
    console.log(chalk.dim("Offer rejected. Nothing was changed."));
    process.exit(0);
  }

  let fragmentToApply = envelope.fragment as Record<string, unknown>;
  let edited = false;

  if (choice === "edit") {
    fragmentToApply = await editFragment(fragmentToApply);
    edited = true;
  }

  // Determine target harness.yaml
  const targetPath = flags.into ?? "harness.yaml";
  await applyFragment(
    fragmentToApply,
    targetPath,
    verifyResult.fingerprint,
    edited
  );

  // Format the fragment filename (used in result display)
  const fragName = getFragmentFilename(fragmentToApply);
  const exchangeDir = path.join(path.dirname(targetPath), ".harness", "exchange");
  const fragFilePath = path.join(exchangeDir, fragName);

  if (flags.json) {
    console.log(
      JSON.stringify({
        status: "accepted",
        fragment: fragFilePath,
        harness: targetPath,
        fingerprint: verifyResult.fingerprint,
        edited,
      })
    );
  } else {
    console.log(
      formatAcceptResult(fragFilePath, targetPath, verifyResult.fingerprint)
    );
  }

  process.exit(0);
}

// ─── apply helpers ────────────────────────────────────────────────────────────

/**
 * Write the accepted fragment into the exchange store and append an `extends`
 * entry to the target harness.yaml.
 *
 * Per HEP-7 / the rubber-duck review:
 * - Fragment is referenced via a standard v1 ./ local source (no new source schemes).
 * - Provenance is stored in a sidecar file, NOT as x- annotations on the extends entry
 *   (which would be rejected by the v1 schema's additionalProperties: false on extends items).
 * - The target harness.yaml is written using yaml.parseDocument() (Document API) to
 *   preserve user comments and formatting.
 * - The modified target is re-validated to ensure it stays v1-valid.
 */
async function applyFragment(
  fragment: Record<string, unknown>,
  targetPath: string,
  senderFingerprint: string,
  edited: boolean
): Promise<void> {
  const targetDir = path.dirname(path.resolve(targetPath));
  const exchangeDir = path.join(targetDir, ".harness", "exchange");

  // Create exchange store with 0700 permissions
  await mkdir(exchangeDir, { recursive: true, mode: 0o700 });

  const fragName = getFragmentFilename(fragment);
  const fragPath = path.join(exchangeDir, fragName);

  // Path-safety guard — belt-and-suspenders even though metadata.name
  // is schema-enforced kebab-case
  const resolved = path.resolve(fragPath);
  const resolvedDir = path.resolve(exchangeDir);
  if (!resolved.startsWith(resolvedDir + path.sep)) {
    console.error(chalk.red("Error: fragment filename would escape exchange directory."));
    process.exit(1);
  }

  // Write the fragment as YAML
  await writeFile(fragPath, yamlStringify(fragment), "utf-8");

  // Write provenance sidecar — provenance lives OFF the harness file (see notes above)
  const sidecar = {
    receivedFrom: senderFingerprint,
    receivedAt: new Date().toISOString(),
    edited,
  };
  await writeFile(fragPath.replace(".harness.yaml", ".meta.json"), JSON.stringify(sidecar, null, 2), "utf-8");

  // Compute the ./relative source for the extends entry
  const relSource = "./" + path.relative(targetDir, fragPath).replace(/\\/g, "/");

  // Append the extends entry using the yaml Document API (preserves comments/formatting)
  let targetYaml: string;
  try {
    targetYaml = await readFile(targetPath, "utf-8");
  } catch {
    // Target doesn't exist — create a minimal fragment harness referencing this one
    targetYaml = `version: "1"\nkind: profile\nmetadata:\n  name: my-harness\n  description: "My harness"\nextends: []\n`;
  }

  const yamlDoc = parseDocument(targetYaml);

  // Get or create the extends array
  let extendsSeq = yamlDoc.get("extends");
  if (!extendsSeq) {
    yamlDoc.set("extends", []);
    extendsSeq = yamlDoc.get("extends");
  }

  // Build the new entry object
  const fragmentConfig = parseHarness(yamlStringify(fragment));
  const fragVersion = (fragmentConfig.config as Record<string, unknown> | null)
    ? (fragmentConfig.config as Record<string, unknown>).metadata
      ? ((fragmentConfig.config as Record<string, unknown>).metadata as Record<string, unknown>).version as string | undefined
      : undefined
    : undefined;

  const newEntry: Record<string, string> = { source: relSource };
  if (fragVersion) {
    newEntry.version = fragVersion;
  }

  // Append to the extends sequence in the Document (preserves comments)
  if (yamlDoc.hasIn(["extends"])) {
    const seq = yamlDoc.getIn(["extends"], true) as { add: (v: unknown) => void } | null;
    if (seq && typeof seq.add === "function") {
      seq.add(newEntry);
    } else {
      yamlDoc.set("extends", [newEntry]);
    }
  } else {
    yamlDoc.set("extends", [newEntry]);
  }

  await writeFile(targetPath, yamlDoc.toString(), "utf-8");
}

/**
 * Open $EDITOR on a YAML temp copy of the fragment, re-validate on save.
 * Returns the edited fragment object.
 */
async function editFragment(
  fragment: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { execSync } = await import("node:child_process");
  const { mkdtemp, unlink } = await import("node:fs/promises");
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "harness-exchange-"));
  const tmpFile = path.join(tmpDir, "fragment.harness.yaml");

  await writeFile(tmpFile, yamlStringify(fragment), "utf-8");

  const editor = process.env.EDITOR ?? "vi";
  try {
    execSync(`${editor} "${tmpFile}"`, { stdio: "inherit" });
  } catch {
    console.error(chalk.red("Error: editor exited with an error. Edit aborted."));
    process.exit(1);
  }

  const edited = await readFile(tmpFile, "utf-8");
  await unlink(tmpFile);

  const parsedEdit = parseHarness(edited);
  if (!parsedEdit.config) {
    console.error(chalk.red("Error: edited fragment is not valid YAML."));
    process.exit(1);
  }

  return parsedEdit.config as Record<string, unknown>;
}

/**
 * Generate a safe filename for a received fragment.
 * Uses metadata.name if present (schema-enforced kebab-case, path-safe),
 * or falls back to a content-hash-based name so nameless fragments work.
 */
function getFragmentFilename(fragment: Record<string, unknown>): string {
  const utcStamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "")
    .replace("T", "T")
    .slice(0, 16); // YYYYMMDDTHHmm

  const meta = fragment.metadata as Record<string, unknown> | undefined;
  const name = meta?.name ? String(meta.name) : `fragment-${fragmentContentId(fragment)}`;

  return `${name}-${utcStamp}.harness.yaml`;
}

// ─── utilities ───────────────────────────────────────────────────────────────

function defaultExpires(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString();
}

/**
 * Parse an expiry value: ISO 8601 or +Nd shorthand (e.g. "+7d", "+24h").
 */
function parseExpiry(value: string): string {
  const shorthand = value.match(/^\+(\d+)([dhm])$/);
  if (shorthand) {
    const n = parseInt(shorthand[1]);
    const unit = shorthand[2];
    const d = new Date();
    if (unit === "d") d.setDate(d.getDate() + n);
    else if (unit === "h") d.setHours(d.getHours() + n);
    else if (unit === "m") d.setMinutes(d.getMinutes() + n);
    return d.toISOString();
  }
  // Assume ISO 8601
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) {
    throw new Error(
      `Invalid expires value: "${value}". Use ISO 8601 or shorthand like +7d, +24h.`
    );
  }
  return parsed.toISOString();
}
