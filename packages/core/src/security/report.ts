import type { SecurityFinding, SecurityReport } from "@harness-kit/shared";

// ── Report formatting types ─────────────────────────────────────

export interface FormattedSecurityReport {
  plugin_name: string;
  plugin_version: string;
  scan_date: string;
  scan_status: string;
  summary: string;
  sections: ReportSection[];
  permissions: PermissionsSection;
}

export interface ReportSection {
  title: string;
  count: number;
  findings: FormattedFinding[];
}

export interface FormattedFinding {
  message: string;
  file_path?: string;
  line_number?: number;
  code_snippet?: string;
  recommendation?: string;
}

export interface PermissionsSection {
  title: string;
  items: PermissionItem[];
}

export interface PermissionItem {
  label: string;
  value: string;
}

// ── Status formatting ───────────────────────────────────────────

const STATUS_LABELS = {
  passed: "✓ Passed",
  warnings: "⚠ Warnings",
  failed: "✗ Failed",
  not_scanned: "- Not Scanned",
};

// ── Main report formatter ───────────────────────────────────────

export function formatSecurityReport(report: SecurityReport): FormattedSecurityReport {
  // Group findings by severity
  const criticalFindings = report.findings.filter((f) => f.severity === "critical");
  const warningFindings = report.findings.filter((f) => f.severity === "warning");
  const infoFindings = report.findings.filter((f) => f.severity === "info");

  // Build sections
  const sections: ReportSection[] = [];

  if (criticalFindings.length > 0) {
    sections.push({
      title: "Critical Issues",
      count: criticalFindings.length,
      findings: criticalFindings.map(formatFinding),
    });
  }

  if (warningFindings.length > 0) {
    sections.push({
      title: "Warnings",
      count: warningFindings.length,
      findings: warningFindings.map(formatFinding),
    });
  }

  if (infoFindings.length > 0) {
    sections.push({
      title: "Informational",
      count: infoFindings.length,
      findings: infoFindings.map(formatFinding),
    });
  }

  // Format permissions summary
  const permissions = formatPermissions(report);

  // Build summary
  const summary = buildSummary(report);

  // Format status
  const scanStatus = STATUS_LABELS[report.scan_status] || report.scan_status;

  return {
    plugin_name: report.plugin_name,
    plugin_version: report.plugin_version,
    scan_date: report.scan_date,
    scan_status: scanStatus,
    summary,
    sections,
    permissions,
  };
}

// ── Helper functions ────────────────────────────────────────────

function formatFinding(finding: SecurityFinding): FormattedFinding {
  return {
    message: finding.message,
    file_path: finding.file_path,
    line_number: finding.line_number,
    code_snippet: finding.code_snippet,
    recommendation: finding.recommendation,
  };
}

function formatPermissions(report: SecurityReport): PermissionsSection {
  const items: PermissionItem[] = [];

  // Network access
  items.push({
    label: "Network Access",
    value: report.permissions.network_access ? "Yes" : "No",
  });

  // File writes
  items.push({
    label: "File Writes",
    value: report.permissions.file_writes ? "Yes" : "No",
  });

  // Environment variables
  if (report.permissions.env_var_reads.length > 0) {
    items.push({
      label: "Environment Variables",
      value: `${report.permissions.env_var_reads.length} variable${report.permissions.env_var_reads.length !== 1 ? "s" : ""} (${report.permissions.env_var_reads.join(", ")})`,
    });
  } else {
    items.push({
      label: "Environment Variables",
      value: "None",
    });
  }

  // External URLs
  if (report.permissions.external_urls.length > 0) {
    items.push({
      label: "External URLs",
      value: `${report.permissions.external_urls.length} URL${report.permissions.external_urls.length !== 1 ? "s" : ""}`,
    });
    // Add individual URLs as sub-items
    for (const url of report.permissions.external_urls) {
      items.push({
        label: "",
        value: `  - ${url}`,
      });
    }
  } else {
    items.push({
      label: "External URLs",
      value: "None",
    });
  }

  // Filesystem patterns
  if (report.permissions.filesystem_patterns.length > 0) {
    items.push({
      label: "Filesystem Patterns",
      value: `${report.permissions.filesystem_patterns.length} pattern${report.permissions.filesystem_patterns.length !== 1 ? "s" : ""}`,
    });
    // Add individual patterns as sub-items
    for (const pattern of report.permissions.filesystem_patterns) {
      items.push({
        label: "",
        value: `  - ${pattern}`,
      });
    }
  } else {
    items.push({
      label: "Filesystem Patterns",
      value: "None",
    });
  }

  return {
    title: "Permissions Summary",
    items,
  };
}

function buildSummary(report: SecurityReport): string {
  const parts: string[] = [];

  if (report.critical_count > 0) {
    parts.push(`${report.critical_count} critical issue${report.critical_count !== 1 ? "s" : ""}`);
  }

  if (report.warning_count > 0) {
    parts.push(`${report.warning_count} warning${report.warning_count !== 1 ? "s" : ""}`);
  }

  if (report.info_count > 0) {
    parts.push(`${report.info_count} info${report.info_count !== 1 ? "" : ""}`);
  }

  if (parts.length === 0) {
    return "No issues found";
  }

  return parts.join(", ");
}
