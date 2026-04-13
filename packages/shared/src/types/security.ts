// ── Security scanning types ─────────────────────────────────

export type SecurityScanStatus = "passed" | "warnings" | "failed" | "not_scanned";

export type SecurityFindingSeverity = "critical" | "warning" | "info";

export type SecurityFindingCategory =
  | "external_url"
  | "env_var_exfiltration"
  | "filesystem_access"
  | "suspicious_script"
  | "permission_request"
  | "network_access";

export interface SecurityFinding {
  id: string;
  severity: SecurityFindingSeverity;
  category: SecurityFindingCategory;
  message: string;
  file_path?: string;
  line_number?: number;
  code_snippet?: string;
  recommendation?: string;
}

export interface SecurityPermissionsSummary {
  network_access: boolean;
  file_writes: boolean;
  env_var_reads: string[];
  external_urls: string[];
  filesystem_patterns: string[];
}

export interface SecurityReport {
  plugin_name: string;
  plugin_version: string;
  scan_date: string;
  scan_status: SecurityScanStatus;
  findings: SecurityFinding[];
  permissions: SecurityPermissionsSummary;
  critical_count: number;
  warning_count: number;
  info_count: number;
}

// ── Security types ──────────────────────────────────────────

export interface PermissionsState {
  tools: { allow: string[]; deny: string[]; ask: string[] };
  paths: { writable: string[]; readonly: string[] };
  network: { allowedHosts: string[] };
}

export interface SecurityPreset {
  id: string;
  name: string;
  description: string;
  permissions: PermissionsState;
}

export interface KeychainSecretInfo {
  name: string;
  description: string;
  required: boolean;
  isSet: boolean;
  pluginName?: string;
}

export interface EnvConfigEntry {
  name: string;
  description: string;
  value: string;
  pluginName?: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  eventType: string;
  category: string;
  summary: string;
  details: string | null;
  source: string;
}
