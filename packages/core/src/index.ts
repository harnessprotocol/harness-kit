// Types

// Compile
export { compile } from "./compile/compile.js";
export { compileInstructions, getAllInstructionFilePaths } from "./compile/instructions.js";
// Markers
export {
  appendMarkerBlock,
  buildMarkerBlock,
  findMarkerBlock,
  findOrphanedMarkerBlocks,
  removeOrphanedBlocks,
  replaceMarkerBlock,
} from "./compile/markers.js";
export { compileMcpServers } from "./compile/mcp-servers.js";
export { buildPermissionsText, compilePermissions } from "./compile/permissions.js";
export { compileSkills } from "./compile/skills.js";
// Platform detection
export { detectPlatforms } from "./detect/detect-platforms.js";
export type { FsProvider } from "./fs-provider.js";
export type { ParseResult } from "./parser/parse-harness.js";
// Parser
export { parseHarness } from "./parser/parse-harness.js";
// Report
export { buildReport } from "./report/report.js";
// Validation
export { validateHarness, validateHarnessYaml } from "./schema/validate.js";
export type {
  FormattedFinding,
  FormattedSecurityReport,
  PermissionItem,
  PermissionsSection,
  ReportSection,
} from "./security/report.js";
export { formatSecurityReport } from "./security/report.js";
export type { RuleResult, ScanContext, SecurityRule } from "./security/rules.js";
export {
  ALL_RULES,
  detectBroadFilesystemAccess,
  detectEnvVarExfiltration,
  detectExternalUrls,
  detectNetworkAccess,
  detectSuspiciousScripts,
  runSecurityRules,
} from "./security/rules.js";
// Security scanner types
export type { ScanOptions } from "./security/scanner.js";
// Security scanner
export { scanPlugin } from "./security/scanner.js";
export type {
  CompileOptions,
  CompileReport,
  CompileReportEntry,
  CompileResult,
  DetectedPlatform,
  EnvDeclaration,
  FileAction,
  FileActionType,
  HarnessConfig,
  HarnessInstructions,
  HarnessMetadata,
  HarnessPermissions,
  HarnessPlugin,
  McpServer,
  McpServerNetwork,
  McpServerStdio,
  OrphanedBlock,
  TargetPlatform,
  ValidationError,
  ValidationResult,
} from "./types.js";
export { isLegacyFormat } from "./utils/legacy.js";
// Utilities
export { posixDirname, posixJoin } from "./utils/posix-path.js";
