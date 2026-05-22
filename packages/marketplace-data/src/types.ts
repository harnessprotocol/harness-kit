import type { SecurityFindingCategory, SecurityFindingSeverity, SecurityScanStatus } from "@harness-kit/shared";

/**
 * Trust tier shown on cards/detail pages, derived from the security scan status.
 * Distinct from `SecurityScanStatus` so the UI vocabulary can diverge from the
 * scanner's internal states without churning the scanner.
 */
export type TrustTier = "verified" | "caution" | "warning" | "unscanned";

/**
 * Identifies where a plugin came from. Today only "first-party" (generated from
 * this git repo) exists. A future dynamic/community source sets its own id, which
 * is how a merged browse UI keeps sources distinguishable.
 */
export type PluginSourceId = "first-party" | (string & {});

export interface MarketplaceCategory {
  slug: string;
  name: string;
  displayOrder: number;
}

export interface MarketplaceEnvRequirement {
  name: string;
  description: string;
  required: boolean;
  sensitive: boolean;
  when?: string;
}

export interface MarketplaceMcp {
  command: string;
  args: string[];
  transport: string;
}

export interface MarketplaceSkill {
  /** Skill directory name (e.g. "memory" for the membrain plugin). */
  dir: string;
  name: string;
  description: string;
  dependencies?: string;
  /** Full SKILL.md body (frontmatter stripped), rendered inline on detail pages. */
  body: string;
}

export interface MarketplaceFinding {
  severity: SecurityFindingSeverity;
  category: SecurityFindingCategory;
  message: string;
  filePath?: string;
  lineNumber?: number;
  recommendation?: string;
}

export interface MarketplacePermissions {
  networkAccess: boolean;
  fileWrites: boolean;
  envVarReads: string[];
  externalUrls: string[];
  filesystemPatterns: string[];
}

export interface MarketplaceSecurity {
  status: SecurityScanStatus;
  trust: TrustTier;
  summary: string;
  scanDate: string;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  permissions: MarketplacePermissions;
  findings: MarketplaceFinding[];
}

export interface MarketplacePlugin {
  name: string;
  slug: string;
  description: string;
  version: string;
  author: string;
  license: string;
  category: string;
  tags: string[];
  /** Repo-relative path from marketplace.json (e.g. "./plugins/research"). */
  repoPath: string;
  /** Which source produced this plugin — see {@link PluginSourceId}. */
  sourceId: PluginSourceId;
  installCommand: string;
  requiresEnv: MarketplaceEnvRequirement[];
  mcp: MarketplaceMcp | null;
  skills: MarketplaceSkill[];
  security: MarketplaceSecurity;
}

export interface MarketplaceData {
  generatedAt: string;
  marketplaceName: string;
  owner: string;
  categories: MarketplaceCategory[];
  plugins: MarketplacePlugin[];
}

/**
 * A source of marketplace plugins. The build-time static generator emits one
 * source ("first-party"); the browse layer composes an array of these and merges
 * them, so a future client-side `RemoteSource` (community/team plugins fetched
 * from an API) drops in behind the same interface with no UI rewrite.
 */
export interface MarketplaceSource {
  id: PluginSourceId;
  listPlugins(): Promise<MarketplacePlugin[]> | MarketplacePlugin[];
}
