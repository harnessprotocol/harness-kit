/**
 * Local mirror of the shape emitted by `@harness-kit/marketplace-data`. The
 * website installs in isolation (no workspace deps), so rather than depend on
 * the generator package we describe the JSON contract here. Keep in sync with
 * packages/marketplace-data/src/types.ts.
 */

export type TrustTier = "verified" | "caution" | "warning" | "unscanned";

export type SecurityScanStatus = "passed" | "warnings" | "failed" | "not_scanned";

export type FindingSeverity = "critical" | "warning" | "info";

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
  dir: string;
  name: string;
  description: string;
  dependencies?: string;
  body: string;
}

export interface MarketplaceFinding {
  severity: FindingSeverity;
  category: string;
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
  repoPath: string;
  sourceId: string;
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
 * A source of marketplace plugins. Today the browse layer composes a single
 * static source; a future client-side remote source (community/team plugins)
 * implements this same interface and merges in with no UI change.
 */
export interface MarketplaceSource {
  id: string;
  listPlugins(): MarketplacePlugin[] | Promise<MarketplacePlugin[]>;
}
