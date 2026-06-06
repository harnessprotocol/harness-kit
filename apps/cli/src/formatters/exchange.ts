/**
 * Display formatters for the Exchange CLI commands.
 */

import chalk from "chalk";
import { stringify as yamlStringify } from "yaml";
import type { PlaintextOfferEnvelope, VerifyResult } from "@harness-kit/exchange";

/**
 * Format the consent-first preview for `harness exchange accept`.
 *
 * Per HEP-7, the preview MUST show:
 *   - Sender fingerprint (NOT just display name)
 *   - Signature verification status
 *   - Full, untruncated fragment content
 *   - All env declarations with sensitive entries highlighted
 *   - All MCP server commands
 *
 * The preview MUST NOT truncate content to make the fragment look simpler.
 */
export function formatPreview(
  envelope: PlaintextOfferEnvelope,
  verifyResult: VerifyResult
): string {
  const lines: string[] = [];

  // Header
  lines.push("");
  lines.push(chalk.bold("Exchange offer"));
  lines.push("─".repeat(50));

  // Sender (fingerprint is the authenticated identity; display is advisory)
  const fp = verifyResult.ok ? verifyResult.fingerprint : "(unverified)";
  lines.push(`${chalk.dim("Sender key:")} ${chalk.cyan(fp)}`);
  if (envelope.sender.display) {
    lines.push(`${chalk.dim("Display name:")} ${envelope.sender.display} ${chalk.dim("(UNVERIFIED — trust the fingerprint, not this name)")}`);
  }

  // Signature
  lines.push(
    `${chalk.dim("Signature:")} ${verifyResult.ok ? chalk.green("VERIFIED ✓") : chalk.red("FAILED ✗")}`
  );

  // Expiry
  const expiresAt = new Date(envelope.expires);
  const expiredNow = expiresAt <= new Date();
  lines.push(
    `${chalk.dim("Expires:")} ${expiredNow ? chalk.red(envelope.expires + " (EXPIRED)") : chalk.dim(envelope.expires)}`
  );

  // Message from sender
  if (envelope.message) {
    lines.push("");
    lines.push(`${chalk.dim("Message:")} ${envelope.message}`);
  }

  // Fragment content (full, untruncated)
  lines.push("");
  lines.push(chalk.bold("Fragment contents:"));
  lines.push("─".repeat(50));
  lines.push(yamlStringify(envelope.fragment));

  // Highlighted env entries
  const envEntries = envelope.fragment.env as Array<Record<string, unknown>> | undefined;
  if (envEntries && envEntries.length > 0) {
    const sensitiveVars = envEntries.filter((e) => e.sensitive !== false);
    if (sensitiveVars.length > 0) {
      lines.push(chalk.yellow(`⚠ ${sensitiveVars.length} sensitive environment variable(s):`));
      for (const entry of sensitiveVars) {
        lines.push(
          `  ${chalk.yellow(String(entry.name))} — ${chalk.dim(String(entry.description ?? ""))}`
        );
      }
    }
  }

  // MCP server commands
  const mcpServers = envelope.fragment["mcp-servers"] as Record<string, unknown> | undefined;
  if (mcpServers && Object.keys(mcpServers).length > 0) {
    lines.push("");
    lines.push(chalk.bold("MCP server commands:"));
    for (const [name, server] of Object.entries(mcpServers)) {
      const s = server as Record<string, unknown>;
      if (s.transport === "stdio") {
        const cmd = `${String(s.command)} ${(s.args as string[] | undefined)?.join(" ") ?? ""}`.trim();
        lines.push(`  ${chalk.cyan(name)}: ${chalk.dim(cmd)}`);
      } else {
        lines.push(`  ${chalk.cyan(name)}: ${chalk.dim(String(s.url ?? "(remote)"))}`);
      }
    }
  }

  lines.push("─".repeat(50));
  lines.push("");

  return lines.join("\n");
}

/**
 * Format a keypair for display after `harness exchange keygen`.
 */
export function formatKeypair(publicKey: string, fingerprint: string): string {
  return [
    "",
    chalk.bold("Exchange keypair generated"),
    `${chalk.dim("Fingerprint:")} ${chalk.cyan(fingerprint)}`,
    `${chalk.dim("Public key:")}  ${chalk.dim(publicKey)}`,
    chalk.yellow(
      "⚠ Private key stored at ~/.harness/exchange/identity.key (mode 0600)"
    ),
    chalk.yellow("  Keep it safe — there is no recovery if it is lost."),
    "",
  ].join("\n");
}

/**
 * Format the result of a successful accept for display.
 */
export function formatAcceptResult(
  fragmentPath: string,
  targetHarness: string,
  fingerprint: string
): string {
  return [
    "",
    chalk.green("✓ Fragment accepted"),
    `${chalk.dim("Fragment stored at:")} ${fragmentPath}`,
    `${chalk.dim("Extends entry added to:")} ${targetHarness}`,
    `${chalk.dim("From sender:")} ${chalk.cyan(fingerprint)}`,
    chalk.dim("Note: extends resolution requires a compile step to take effect."),
    "",
  ].join("\n");
}
