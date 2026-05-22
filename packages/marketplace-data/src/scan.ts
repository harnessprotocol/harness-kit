import { formatSecurityReport, scanPlugin } from "@harness-kit/core";
import { NodeFsProvider } from "@harness-kit/core/node";
import type { MarketplaceSecurity } from "./types.js";
import { trustFromStatus } from "./trust.js";

/**
 * Runs the harness-kit security scanner over a plugin directory and maps the
 * result into the marketplace's camelCase shape, deriving a trust tier.
 */
export async function scanForMarketplace(pluginDir: string): Promise<MarketplaceSecurity> {
  const fs = new NodeFsProvider();
  const report = await scanPlugin({ pluginDir, fs });
  const formatted = formatSecurityReport(report);

  return {
    status: report.scan_status,
    trust: trustFromStatus(report.scan_status),
    summary: formatted.summary,
    scanDate: report.scan_date,
    criticalCount: report.critical_count,
    warningCount: report.warning_count,
    infoCount: report.info_count,
    permissions: {
      networkAccess: report.permissions.network_access,
      fileWrites: report.permissions.file_writes,
      envVarReads: report.permissions.env_var_reads,
      externalUrls: report.permissions.external_urls,
      filesystemPatterns: report.permissions.filesystem_patterns,
    },
    findings: report.findings.map((f) => ({
      severity: f.severity,
      category: f.category,
      message: f.message,
      ...(f.file_path ? { filePath: f.file_path } : {}),
      ...(f.line_number !== undefined ? { lineNumber: f.line_number } : {}),
      ...(f.recommendation ? { recommendation: f.recommendation } : {}),
    })),
  };
}
