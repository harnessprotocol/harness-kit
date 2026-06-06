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

// A single canonical URL pattern. Bounded repetition prevents ReDoS on adversarial
// input. We intentionally do NOT use bare `curl <token>` / `wget <token>` patterns —
// they report flags like `curl -sf` as if they were URLs. Any real URL passed to
// curl/wget/fetch is still captured by this pattern.
const EXTERNAL_URL_PATTERNS = [/https?:\/\/[^\s"'`]{1,2048}/gi];

// Loopback hosts are local, not external. Matched as a string (not via URL parsing) so
// that shell-variable ports like http://localhost:${PORT}/health are still recognised
// as local — `new URL()` throws on the `${...}`, which previously leaked them through.
const LOOPBACK_URL = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?:[:/]|$)/i;

// Trailing punctuation that prose/markup tacks onto a URL, e.g. "https://x.com)." — trimmed
// with a linear scan rather than a `[...]+$` regex, which backtracks polynomially (ReDoS).
const TRAILING_URL_PUNCT = new Set([")", ".", ",", ";", ":", "'", '"', "`"]);

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
  // `os.system(` (Python) or a bare `system(` call — but NOT `platform.system()`,
  // `subsystem(`, etc., which merely contain the substring "system".
  { pattern: /\bos\.system\s*\(|(?<![.\w])system\s*\(/gi, reason: "System command execution" },
  { pattern: /shell\s*=\s*True/gi, reason: "Shell command with shell=True" },
  { pattern: /\|\s*bash/gi, reason: "Piped bash execution" },
  { pattern: /\|\s*sh/gi, reason: "Piped shell execution" },
  { pattern: /rm\s+-rf\s+[/~]/gi, reason: "Dangerous file deletion" },
  { pattern: /chmod\s+777/gi, reason: "Overly permissive file permissions" },
];

const BROAD_FILESYSTEM_PATTERNS: Array<{
  pattern: RegExp;
  reason: string;
  /**
   * When true, the root-glob match must begin a path token (start of string, or after a
   * quote/space/bracket/etc.) to count as root-level access. This prevents matching a
   * recursive glob inside a relative path like "research/" + glob, which merely
   * describes what files a plugin reads — not broad root access.
   */
  requireRootBoundary?: boolean;
}> = [
  { pattern: /\/\*\*/g, reason: "Root-level recursive access", requireRootBoundary: true },
  { pattern: /~\/\*\*/g, reason: "Home directory recursive access" },
  { pattern: /\.\.\/\.\.\//g, reason: "Parent directory traversal" },
];

function isMarkdown(filePath: string): boolean {
  return filePath.endsWith(".md") || filePath.endsWith(".mdx");
}

// Matches a fenced-code delimiter line (``` or ~~~, optionally indented up to 3 spaces).
const FENCE_DELIMITER = /^\s{0,3}(?:```|~~~)/;

/**
 * Returns markdown content with everything OUTSIDE fenced code blocks blanked to empty
 * lines (line numbers are preserved). Prose — including inline-code globs like the
 * `research` recursive-glob example and env-var mentions — is documentation and is
 * dropped, eliminating false positives. Fenced code blocks are kept and scanned like
 * code, because a hook can actually execute what a doc presents as a runnable command.
 */
export function extractFencedCode(content: string): string {
  const lines = content.split("\n");
  let inFence = false;
  const out: string[] = [];

  for (const line of lines) {
    if (FENCE_DELIMITER.test(line)) {
      inFence = !inFence;
      out.push(""); // the delimiter line itself is not code
      continue;
    }
    out.push(inFence ? line : "");
  }

  return out.join("\n");
}

/**
 * The content a behavioral rule should scan. For markdown docs that is only the fenced
 * code blocks; for everything else it is the file verbatim. Declared manifest permissions
 * remain the authoritative capability signal and are analyzed separately.
 */
function behavioralContent(filePath: string, content: string): string {
  return isMarkdown(filePath) ? extractFencedCode(content) : content;
}

/** Path characters that, when immediately before a root glob, indicate a *relative* glob
 *  (e.g. the `research` recursive-glob example) rather than a root-level one. */
const RELATIVE_PATH_PREFIX = /[\w.\-~/]/;

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
  const { filePath } = context;
  // In markdown, scan only fenced code blocks — prose URLs are documentation.
  const content = behavioralContent(filePath, context.content);

  const urls = new Set<string>();

  for (const pattern of EXTERNAL_URL_PATTERNS) {
    let match;
    const regex = new RegExp(pattern);
    while ((match = regex.exec(content)) !== null) {
      // Strip trailing punctuation picked up from prose/markup, e.g. "https://x.com)".
      const raw = match[0];
      let cut = raw.length;
      while (cut > 0 && TRAILING_URL_PUNCT.has(raw[cut - 1])) cut--;
      const url = raw.slice(0, cut);

      // Loopback/local hosts are not external (string check tolerates ${PORT} vars).
      if (LOOPBACK_URL.test(url)) continue;

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
            // An external URL reference is informational, not a warning. The dangerous
            // case — sending secrets to a URL — is caught separately as `critical`
            // exfiltration. Surfacing every referenced URL as a warning cried wolf.
            "info",
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
  const { filePath } = context;
  // In markdown, scan only fenced code blocks — `$VAR` in prose is an example, not a read.
  const content = behavioralContent(filePath, context.content);

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
  const { filePath } = context;
  // In markdown, scan only fenced code blocks — glob examples in prose describe what a
  // plugin reads, not broad access it requests. Declared paths come from the manifest.
  const content = behavioralContent(filePath, context.content);

  for (const { pattern, reason, requireRootBoundary } of BROAD_FILESYSTEM_PATTERNS) {
    let match;
    const regex = new RegExp(pattern);
    while ((match = regex.exec(content)) !== null) {
      // `/**` mid-path (e.g. `research/**`) is a relative glob, not root-level access.
      if (requireRootBoundary && match.index > 0) {
        const prevChar = content[match.index - 1];
        if (RELATIVE_PATH_PREFIX.test(prevChar)) continue;
      }

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
  const { filePath } = context;

  // Scan script files/hooks in full. For markdown, scan only fenced code blocks — a hook
  // can run what a doc presents as a command, but prose ("eval() is dangerous") is not code.
  const isScript =
    filePath.endsWith(".sh") ||
    filePath.endsWith(".py") ||
    filePath.endsWith(".js") ||
    filePath.endsWith(".ts") ||
    filePath.includes("scripts/") ||
    filePath.includes("hooks/");

  let content: string;
  if (isScript) {
    content = context.content;
  } else if (isMarkdown(filePath)) {
    content = extractFencedCode(context.content);
  } else {
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
  const { filePath } = context;
  // In markdown, scan only fenced code blocks — socket references in prose are examples.
  const content = behavioralContent(filePath, context.content);

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
