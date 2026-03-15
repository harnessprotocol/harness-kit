// Types
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

export type { FsProvider } from "./fs-provider.js";
export type { ParseResult } from "./parser/parse-harness.js";

// Parser
export { parseHarness } from "./parser/parse-harness.js";

// Validation
export { validateHarness, validateHarnessYaml } from "./schema/validate.js";

// Platform detection
export { detectPlatforms } from "./detect/detect-platforms.js";

// Compile
export { compile } from "./compile/compile.js";
export { compileInstructions } from "./compile/instructions.js";
export { compileMcpServers } from "./compile/mcp-servers.js";
export { compileSkills } from "./compile/skills.js";
export { compilePermissions, buildPermissionsText } from "./compile/permissions.js";

// Markers
export {
  buildMarkerBlock,
  findMarkerBlock,
  replaceMarkerBlock,
  appendMarkerBlock,
  findOrphanedMarkerBlocks,
  removeOrphanedBlocks,
} from "./compile/markers.js";

// Report
export { buildReport } from "./report/report.js";
