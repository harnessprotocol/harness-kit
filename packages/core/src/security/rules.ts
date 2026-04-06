import type {
  SecurityFinding,
  SecurityFindingSeverity,
  SecurityFindingCategory,
} from "@harness-kit/shared";

/** Generates a short collision-resistant ID for a finding without requiring crypto imports. */
export function findingId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// ── Rule interfaces ─────────────────────────────────────────────

export interface ScanContext {
  pluginName: string;
  filePath: string;
  content: string;
}

export interface RuleResult {
  findings: SecurityFinding[];
}

export type SecurityRule = (context: ScanContext) => RuleResult;

// ── Pattern definitions ─────────────────────────────────────────

const EXTERNAL_URL_PATTERNS = [
  // Bounded repetition prevents ReDoS on adversarial input
  /https?:\/\/[^\s"'`]{1,2048}/gi,
  /curl\s+[^\s]{1,512}/gi,
  /wget\s+[^\s]{1,512}/gi,
  /fetch\s*\(\s*['"`]https?:\/\//gi,
];

const ENV_VAR_PATTERNS = [
  /\$\{?([A-Z_][A-Z0-9_]*)\}?/g,
  /process\.env\.([A-Z_][A-Z0-9_]*)/g,
  /os\.getenv\s*\(\s*['"]([A-Z_][A-Z0-9_]*)['"]]/g,
  /ENV\s*\[\s*['"]([A-Z_][A-Z0-9_]*)['"]]/g,
];

const SENSITIVE_ENV_VARS = [
  "API_KEY",
  "SECRET",
  "TOKEN",
  "PASSWORD",
  "PRIVATE_KEY",
  "AWS_",
  "GITHUB_",
  "SLACK_",
  "OPENAI_",
  "ANTHROPIC_",
];

const SUSPICIOUS_SCRIPT_PATTERNS = [
  { pattern: /eval\s*\(/gi, reason: "Dynamic code evaluation (eval)" },
  // Negative lookbehind excludes regex .exec() calls (e.g. /foo/.exec(str))
  { pattern: /(?<!\.)\bexec\s*\(/gi, reason: "Command execution (exec)" },
  { pattern: /system\s*\(/gi, reason: "System command execution" },
  { pattern: /shell\s*=\s*True/gi, reason: "Shell command with shell=True" },
  { pattern: /\|\s*bash/gi, reason: "Piped bash execution" },
  { pattern: /\|\s*sh/gi, reason: "Piped shell execution" },
  { pattern: /rm\s+-rf\s+[/~]/gi, reason: "Dangerous file deletion" },
  { pattern: /chmod\s+777/gi, reason: "Overly permissive file permissions" },
];

const BROAD_FILESYSTEM_PATTERNS = [
  { pattern: /\/\*\*/g, reason: "Root-level recursive access" },
  { pattern: /~\/\*\*/g, reason: "Home directory recursive access" },
  { pattern: /\.\.\/\.\.\//g, reason: "Parent directory traversal" },
];

// ── Helper functions ────────────────────────────────────────────

function createFinding(
  severity: SecurityFindingSeverity,
  category: SecurityFindingCategory,
  message: string,
  filePath: string,
  lineNumber?: number,
  codeSnippet?: string,
  recommendation?: string,
): SecurityFinding {
  return {
    id: findingId(),
    severity,
    category,
    message,
    file_path: filePath,
    line_number: lineNumber,
    code_snippet: codeSnippet,
    recommendation,
  };
}

function findLineNumber(content: string, index: number): number {
  return content.substring(0, index).split("\n").length;
}

function extractCodeSnippet(content: string, index: number, length: number): string {
  const start = Math.max(0, index - 20);
  const end = Math.min(content.length, index + length + 20);
  return content.substring(start, end).trim();
}

function isSensitiveEnvVar(varName: string): boolean {
  return SENSITIVE_ENV_VARS.some((sensitive) =>
    varName.toUpperCase().includes(sensitive),
  );
}

// ── Security rules ──────────────────────────────────────────────

export function detectExternalUrls(context: ScanContext): RuleResult {
  const findings: SecurityFinding[] = [];
  const { filePath, content } = context;

  // Skip if this is a markdown file (URLs in docs are expected)
  if (filePath.endsWith(".md")) {
    return { findings };
  }

  const urls = new Set<string>();

  for (const pattern of EXTERNAL_URL_PATTERNS) {
    let match;
    const regex = new RegExp(pattern);
    while ((match = regex.exec(content)) !== null) {
      const url = match[0];

      // Skip common safe patterns — use hostname comparison, not includes(),
      // to prevent bypass via subdomain spoofing (e.g. github.com.evil.com)
      try {
        const hostname = new URL(url).hostname.toLowerCase();
        if (
          hostname === "example.com" ||
          hostname === "localhost" ||
          hostname === "127.0.0.1" ||
          hostname === "github.com" ||
          hostname.endsWith(".github.com") ||
          hostname === "gitlab.com" ||
          hostname.endsWith(".gitlab.com")
        ) {
          continue;
        }
      } catch {
        // Not a parseable URL — include in findings anyway
      }

      if (!urls.has(url)) {
        urls.add(url);
        const lineNumber = findLineNumber(content, match.index);
        const snippet = extractCodeSnippet(content, match.index, url.length);

        findings.push(
          createFinding(
            "warning",
            "external_url",
            `External URL detected: ${url}`,
            filePath,
            lineNumber,
            snippet,
            "Verify this URL is necessary and trustworthy. Consider if this data should be fetched at install time or runtime.",
          ),
        );
      }
    }
  }

  return { findings };
}

export function detectEnvVarExfiltration(context: ScanContext): RuleResult {
  const findings: SecurityFinding[] = [];
  const { filePath, content } = context;

  const envVars = new Map<string, number[]>();

  for (const pattern of ENV_VAR_PATTERNS) {
    let match;
    const regex = new RegExp(pattern);
    while ((match = regex.exec(content)) !== null) {
      const varName = match[1];
      if (!varName) continue;

      const lineNumber = findLineNumber(content, match.index);

      if (!envVars.has(varName)) {
        envVars.set(varName, []);
      }
      envVars.get(varName)!.push(lineNumber);
    }
  }

  // Check for sensitive environment variables
  for (const [varName, lineNumbers] of envVars.entries()) {
    if (isSensitiveEnvVar(varName)) {
      const severity: SecurityFindingSeverity = "critical";
      const lines = lineNumbers.join(", ");

      findings.push(
        createFinding(
          severity,
          "env_var_exfiltration",
          `Sensitive environment variable access detected: ${varName} (lines: ${lines})`,
          filePath,
          lineNumbers[0],
          undefined,
          `Ensure ${varName} is properly declared in requires.env and only used for its intended purpose. Never send sensitive values to external URLs.`,
        ),
      );
    }
  }

  // Look for patterns that suggest data exfiltration
  const exfiltrationPatterns = [
    /fetch.*process\.env/gi,
    /curl.*\$[A-Z_]/gi,
    /wget.*\$[A-Z_]/gi,
    /requests\.(get|post).*os\.getenv/gi,
  ];

  for (const pattern of exfiltrationPatterns) {
    let match;
    const regex = new RegExp(pattern);
    while ((match = regex.exec(content)) !== null) {
      const lineNumber = findLineNumber(content, match.index);
      const snippet = extractCodeSnippet(content, match.index, match[0].length);

      findings.push(
        createFinding(
          "critical",
          "env_var_exfiltration",
          "Potential environment variable exfiltration detected: sending env vars over network",
          filePath,
          lineNumber,
          snippet,
          "Review this code carefully. Sending environment variables over the network can expose sensitive credentials.",
        ),
      );
    }
  }

  return { findings };
}

export function detectBroadFilesystemAccess(context: ScanContext): RuleResult {
  const findings: SecurityFinding[] = [];
  const { filePath, content } = context;

  for (const { pattern, reason } of BROAD_FILESYSTEM_PATTERNS) {
    let match;
    const regex = new RegExp(pattern);
    while ((match = regex.exec(content)) !== null) {
      const lineNumber = findLineNumber(content, match.index);
      const snippet = extractCodeSnippet(content, match.index, match[0].length);

      findings.push(
        createFinding(
          "warning",
          "filesystem_access",
          `Broad filesystem access pattern detected: ${reason}`,
          filePath,
          lineNumber,
          snippet,
          "Consider limiting filesystem access to specific directories needed by the plugin.",
        ),
      );
    }
  }

  // Check for world-writable permissions requests
  const permissionPatterns = [
    /permissions\s*:\s*{[^}]*writable\s*:\s*\[\s*['"]\/['"]]/gi,
    /permissions\s*:\s*{[^}]*writable\s*:\s*\[\s*['"]~['"]]/gi,
  ];

  for (const pattern of permissionPatterns) {
    let match;
    const regex = new RegExp(pattern);
    while ((match = regex.exec(content)) !== null) {
      const lineNumber = findLineNumber(content, match.index);
      const snippet = extractCodeSnippet(content, match.index, match[0].length);

      findings.push(
        createFinding(
          "critical",
          "filesystem_access",
          "Plugin requests write access to root or home directory",
          filePath,
          lineNumber,
          snippet,
          "Requesting write access to / or ~ is dangerous. Limit write access to specific subdirectories.",
        ),
      );
    }
  }

  return { findings };
}

export function detectSuspiciousScripts(context: ScanContext): RuleResult {
  const findings: SecurityFinding[] = [];
  const { filePath, content } = context;

  // Only scan script files and hooks
  const isScript =
    filePath.endsWith(".sh") ||
    filePath.endsWith(".py") ||
    filePath.endsWith(".js") ||
    filePath.endsWith(".ts") ||
    filePath.includes("scripts/") ||
    filePath.includes("hooks/");

  if (!isScript) {
    return { findings };
  }

  for (const { pattern, reason } of SUSPICIOUS_SCRIPT_PATTERNS) {
    let match;
    const regex = new RegExp(pattern);
    while ((match = regex.exec(content)) !== null) {
      const lineNumber = findLineNumber(content, match.index);
      const snippet = extractCodeSnippet(content, match.index, match[0].length);

      findings.push(
        createFinding(
          "warning",
          "suspicious_script",
          `Suspicious pattern detected: ${reason}`,
          filePath,
          lineNumber,
          snippet,
          "Review this code carefully. This pattern can be dangerous if not properly controlled.",
        ),
      );
    }
  }

  return { findings };
}

export function detectNetworkAccess(context: ScanContext): RuleResult {
  const findings: SecurityFinding[] = [];
  const { filePath, content } = context;

  const networkPatterns = [
    { pattern: /socket\./gi, reason: "Direct socket access" },
    { pattern: /net\.Socket/gi, reason: "Network socket creation" },
    { pattern: /ServerSocket/gi, reason: "Server socket creation" },
    { pattern: /bind\s*\(\s*['"][0-9.]+['"]\s*,\s*\d+\s*\)/gi, reason: "Network binding" },
  ];

  for (const { pattern, reason } of networkPatterns) {
    let match;
    const regex = new RegExp(pattern);
    while ((match = regex.exec(content)) !== null) {
      const lineNumber = findLineNumber(content, match.index);
      const snippet = extractCodeSnippet(content, match.index, match[0].length);

      findings.push(
        createFinding(
          "info",
          "network_access",
          `Network access detected: ${reason}`,
          filePath,
          lineNumber,
          snippet,
          "Ensure network access is necessary and properly documented in the plugin manifest.",
        ),
      );
    }
  }

  return { findings };
}

// ── Rule registry ───────────────────────────────────────────────

export const ALL_RULES: SecurityRule[] = [
  detectExternalUrls,
  detectEnvVarExfiltration,
  detectBroadFilesystemAccess,
  detectSuspiciousScripts,
  detectNetworkAccess,
];

// ── Main rule runner ────────────────────────────────────────────

export function runSecurityRules(
  context: ScanContext,
  rules: SecurityRule[] = ALL_RULES,
): SecurityFinding[] {
  const allFindings: SecurityFinding[] = [];

  for (const rule of rules) {
    const result = rule(context);
    allFindings.push(...result.findings);
  }

  return allFindings;
}
