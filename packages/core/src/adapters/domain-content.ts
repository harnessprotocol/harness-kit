import type { HarnessConfig } from "../types.js";
import type { HarnessDomain } from "./adapter.js";

/**
 * Whether harness.yaml has any content declared for a given domain. Used to
 * decide whether to emit a "domain skipped" warning when an adapter marks
 * that domain's export capability as "none".
 *
 * Only covers domains harness.yaml can currently express (instructions,
 * skills, mcp, permissions). subagents/hooks/model have no corresponding
 * HarnessConfig field yet (they're sized into the domain enum for future
 * WPs) — always reported as having no content since there's nothing yet
 * to warn about skipping.
 */
export function domainHasContent(config: HarnessConfig, domain: HarnessDomain): boolean {
  switch (domain) {
    case "instructions": {
      // HarnessConfig.instructions is typed as HarnessInstructions, but
      // parseHarness/extends.ts tolerate a bare string at the YAML layer
      // (normalized to { operational: <string> } downstream) — guard
      // defensively in case this runs on a config that hasn't gone through
      // that normalization yet.
      const instr = config.instructions as HarnessConfig["instructions"] | string | undefined;
      if (!instr) return false;
      if (typeof instr === "string") return instr.trim().length > 0;
      return Boolean(instr.operational || instr.behavioral || instr.identity);
    }
    case "skills":
      return Boolean(config.plugins && config.plugins.length > 0);
    case "mcp":
      return Boolean(
        config["mcp-servers"] && Object.keys(config["mcp-servers"]).length > 0,
      );
    case "permissions":
      return Boolean(config.permissions);
    case "subagents":
    case "hooks":
    case "model":
      return false;
  }
}
