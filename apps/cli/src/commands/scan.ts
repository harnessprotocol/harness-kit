import { resolve } from "node:path";
import { formatSecurityReport, scanPlugin } from "@harness-kit/core";
import { NodeFsProvider } from "@harness-kit/core/node";

export async function scanCommand(pluginPath?: string): Promise<void> {
  const resolved = resolve(pluginPath ?? ".");
  const fs = new NodeFsProvider();

  // Check if the path exists
  const exists = await fs.exists(resolved);
  if (!exists) {
    console.error(
      `Plugin directory not found: ${resolved}. Specify a valid path: harness-kit scan <path>`,
    );
    process.exit(1);
  }

  // Check if plugin.json exists
  const manifestPath = fs.joinPath(resolved, ".claude-plugin/plugin.json");
  const manifestExists = await fs.exists(manifestPath);
  if (!manifestExists) {
    console.error(
      `No plugin manifest found at ${manifestPath}. Make sure you're scanning a valid plugin directory.`,
    );
    process.exit(1);
  }

  // Run the security scan
  let report;
  try {
    report = await scanPlugin({
      pluginDir: resolved,
      fs,
      includeInfo: true,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Security scan failed: ${msg}`);
    process.exit(1);
  }

  // Format and display the report
  const formattedReport = formatSecurityReport(report);

  console.log(`\n${"=".repeat(60)}`);
  console.log(
    `Security Scan Report: ${formattedReport.plugin_name} v${formattedReport.plugin_version}`,
  );
  console.log(`Status: ${formattedReport.scan_status}`);
  console.log(`Date: ${new Date(formattedReport.scan_date).toLocaleString()}`);
  console.log(`${"=".repeat(60)}\n`);

  console.log(`Summary: ${formattedReport.summary}\n`);

  // Display findings by severity
  for (const section of formattedReport.sections) {
    console.log(`${section.title} (${section.count}):`);
    console.log("-".repeat(60));

    for (const finding of section.findings) {
      console.log(`\n• ${finding.message}`);
      if (finding.file_path) {
        console.log(
          `  File: ${finding.file_path}${finding.line_number ? `:${finding.line_number}` : ""}`,
        );
      }
      if (finding.code_snippet) {
        console.log(`  Code: ${finding.code_snippet}`);
      }
      if (finding.recommendation) {
        console.log(`  Recommendation: ${finding.recommendation}`);
      }
    }
    console.log();
  }

  // Display permissions summary
  console.log(`${formattedReport.permissions.title}:`);
  console.log("-".repeat(60));
  for (const item of formattedReport.permissions.items) {
    if (item.label) {
      console.log(`${item.label}: ${item.value}`);
    } else {
      console.log(item.value);
    }
  }
  console.log();

  // Exit with appropriate code
  process.exit(report.scan_status === "failed" ? 1 : 0);
}
