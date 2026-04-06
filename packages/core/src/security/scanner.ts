import type { FsProvider } from "../fs-provider.js";
import type {
  SecurityReport,
  SecurityFinding,
  SecurityPermissionsSummary,
  SecurityScanStatus,
} from "@harness-kit/shared";
import { randomUUID } from "crypto";
import { readJsonOrDefault } from "../utils/read-json.js";
import { runSecurityRules } from "./rules.js";

// ── Plugin manifest types ───────────────────────────────────────

interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  requires?: {
    env?: Array<{
      name: string;
      description: string;
      required?: boolean;
      sensitive?: boolean;
    }>;
    permissions?: {
      tools?: string[];
      paths?: {
        writable?: string[];
        readonly?: string[];
      };
      network?: {
        "allowed-hosts"?: string[];
      };
    };
  };
}

// ── Scanner options ─────────────────────────────────────────────

export interface ScanOptions {
  /** Plugin directory to scan */
  pluginDir: string;
  /** Filesystem provider */
  fs: FsProvider;
  /** Include info-level findings in the report (default: true) */
  includeInfo?: boolean;
}

// ── Scanner implementation ──────────────────────────────────────

export async function scanPlugin(options: ScanOptions): Promise<SecurityReport> {
  const { pluginDir, fs, includeInfo = true } = options;

  // Read plugin manifest
  const manifestPath = fs.joinPath(pluginDir, ".claude-plugin/plugin.json");
  const { data: manifest, existed } = await readJsonOrDefault<PluginManifest>(
    fs,
    manifestPath,
    { name: "unknown", version: "0.0.0" },
  );

  if (!existed) {
    throw new Error(`Plugin manifest not found: ${manifestPath}`);
  }

  // Scan all relevant files in the plugin directory
  const findings: SecurityFinding[] = [];
  const scannedFiles = await collectScannableFiles(pluginDir, fs);

  for (const filePath of scannedFiles) {
    const fullPath = fs.joinPath(pluginDir, filePath);
    const content = await fs.readFile(fullPath);

    const fileFindings = runSecurityRules({
      pluginName: manifest.name,
      filePath,
      content,
    });

    findings.push(...fileFindings);
  }

  // Analyze manifest for permission requests
  const manifestFindings = analyzeManifestPermissions(manifest, manifestPath);
  findings.push(...manifestFindings);

  // Build permissions summary
  const permissions = buildPermissionsSummary(manifest, findings);

  // Filter findings by severity if needed
  const filteredFindings = includeInfo
    ? findings
    : findings.filter((f) => f.severity !== "info");

  // Calculate severity counts
  const criticalCount = filteredFindings.filter((f) => f.severity === "critical").length;
  const warningCount = filteredFindings.filter((f) => f.severity === "warning").length;
  const infoCount = filteredFindings.filter((f) => f.severity === "info").length;

  // Determine scan status
  const scanStatus: SecurityScanStatus =
    criticalCount > 0 ? "failed" : warningCount > 0 ? "warnings" : "passed";

  return {
    plugin_name: manifest.name,
    plugin_version: manifest.version,
    scan_date: new Date().toISOString(),
    scan_status: scanStatus,
    findings: filteredFindings,
    permissions,
    critical_count: criticalCount,
    warning_count: warningCount,
    info_count: infoCount,
  };
}

// ── Helper functions ────────────────────────────────────────────

async function collectScannableFiles(
  pluginDir: string,
  fs: FsProvider,
): Promise<string[]> {
  const scannableFiles: string[] = [];

  // Directories to scan
  const dirsToScan = ["hooks", "scripts", "skills", "agents"];

  // File extensions to scan
  const scannableExtensions = [".sh", ".py", ".js", ".ts", ".md"];

  const MAX_DEPTH = 15;

  async function walkDirectory(dir: string, depth = 0): Promise<void> {
    if (depth > MAX_DEPTH) {
      return;
    }

    const fullPath = fs.joinPath(pluginDir, dir);
    const exists = await fs.exists(fullPath);

    if (!exists) {
      return;
    }

    try {
      const entries = await fs.readDir(fullPath);

      for (const entry of entries) {
        const entryPath = fs.joinPath(dir, entry);
        const entryFullPath = fs.joinPath(pluginDir, entryPath);

        // Check if it's a directory (by trying to read it)
        const isDir = await isDirectory(entryFullPath, fs);

        if (isDir) {
          await walkDirectory(entryPath, depth + 1);
        } else {
          // Check if file has a scannable extension
          if (scannableExtensions.some((ext) => entry.endsWith(ext))) {
            scannableFiles.push(entryPath);
          }
        }
      }
    } catch {
      // Directory might not be readable, skip it
    }
  }

  // Walk each directory
  for (const dir of dirsToScan) {
    await walkDirectory(dir);
  }

  // Also scan root-level script files
  try {
    const rootEntries = await fs.readDir(pluginDir);
    for (const entry of rootEntries) {
      if (scannableExtensions.some((ext) => entry.endsWith(ext))) {
        scannableFiles.push(entry);
      }
    }
  } catch {
    // Skip if can't read root directory
  }

  return scannableFiles;
}

async function isDirectory(path: string, fs: FsProvider): Promise<boolean> {
  try {
    await fs.readDir(path);
    return true;
  } catch {
    return false;
  }
}

function analyzeManifestPermissions(
  manifest: PluginManifest,
  manifestPath: string,
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  // Check for excessive permission requests
  const permissions = manifest.requires?.permissions;

  if (permissions?.paths?.writable) {
    for (const path of permissions.paths.writable) {
      // Flag root or home directory write access as critical.
      // startsWith("~") covers "~", "~/", and named expansions like "~root".
      if (path === "/" || path.startsWith("~")) {
        findings.push({
          id: randomUUID(),
          severity: "critical",
          category: "permission_request",
          message: `Plugin requests write access to sensitive path: ${path}`,
          file_path: manifestPath,
          recommendation:
            "Limit write access to specific subdirectories needed by the plugin. Requesting write access to / or ~ is dangerous.",
        });
      } else if (path.includes("**")) {
        findings.push({
          id: randomUUID(),
          severity: "warning",
          category: "permission_request",
          message: `Plugin requests broad recursive write access: ${path}`,
          file_path: manifestPath,
          recommendation:
            "Consider limiting the scope of file system access to specific directories.",
        });
      }
    }
  }

  // Check for network permissions with no host restrictions
  if (permissions?.network && !permissions.network["allowed-hosts"]) {
    findings.push({
      id: randomUUID(),
      severity: "info",
      category: "permission_request",
      message: "Plugin requests network access without host restrictions",
      file_path: manifestPath,
      recommendation:
        "Consider specifying allowed-hosts to limit network access to trusted domains.",
    });
  }

  // Check for sensitive environment variables
  const envVars = manifest.requires?.env || [];
  for (const envVar of envVars) {
    if (envVar.sensitive) {
      findings.push({
        id: randomUUID(),
        severity: "info",
        category: "env_var_exfiltration",
        message: `Plugin declares access to sensitive environment variable: ${envVar.name}`,
        file_path: manifestPath,
        recommendation: `Ensure ${envVar.name} is only used for its intended purpose and never sent to untrusted external services.`,
      });
    }
  }

  return findings;
}

function buildPermissionsSummary(
  manifest: PluginManifest,
  findings: SecurityFinding[],
): SecurityPermissionsSummary {
  // Check for network access from manifest
  const hasNetworkPermission = !!manifest.requires?.permissions?.network;

  // Check for network access from findings
  const hasNetworkFindings = findings.some((f) => f.category === "network_access");
  const hasExternalUrls = findings.some((f) => f.category === "external_url");

  const networkAccess = hasNetworkPermission || hasNetworkFindings || hasExternalUrls;

  // Check for file writes from manifest
  const hasFileWritePermission =
    !!manifest.requires?.permissions?.paths?.writable &&
    manifest.requires.permissions.paths.writable.length > 0;

  const fileWrites = hasFileWritePermission;

  // Collect environment variable reads
  const envVarReads = Array.from(
    new Set([
      ...(manifest.requires?.env?.map((e) => e.name) || []),
      ...findings
        .filter((f) => f.category === "env_var_exfiltration")
        .map((f) => {
          // Extract env var name from message like "Sensitive environment variable access detected: TOKEN"
          const match = f.message.match(/variable\s+(?:access\s+detected|declared):\s+(\S+)/i);
          return match ? match[1] : null;
        })
        .filter((name): name is string => name !== null),
    ]),
  );

  // Collect external URLs from findings
  const externalUrls = Array.from(
    new Set(
      findings
        .filter((f) => f.category === "external_url")
        .map((f) => {
          // Extract URL from message like "External URL detected: https://example.com"
          const match = f.message.match(/URL detected:\s+(\S+)/);
          return match ? match[1] : null;
        })
        .filter((url): url is string => url !== null),
    ),
  );

  // Collect filesystem patterns from manifest
  const filesystemPatterns = [
    ...(manifest.requires?.permissions?.paths?.writable || []),
    ...(manifest.requires?.permissions?.paths?.readonly || []),
  ];

  return {
    network_access: networkAccess,
    file_writes: fileWrites,
    env_var_reads: envVarReads,
    external_urls: externalUrls,
    filesystem_patterns: filesystemPatterns,
  };
}
