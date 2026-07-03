/**
 * @deprecated This module is a compatibility shim. The per-target metadata
 * it used to define directly now lives in `../adapters/target-metadata.ts`
 * as part of the WP-2.1 adapter/registry refactor. Import from there in new
 * code — this file re-exports the same names unchanged so existing callers
 * (mcp-servers.ts, check.ts, the CLI, the desktop app) keep compiling
 * without modification.
 */
export type { IntegrationTarget } from "../adapters/target-metadata.js";
export {
  TARGETS,
  getTarget,
  AGENTS_MD_TARGETS,
} from "../adapters/target-metadata.js";
