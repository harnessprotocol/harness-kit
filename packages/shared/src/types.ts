// ── Core enums ──────────────────────────────────────────────

export type ComponentType =
  | "skill"
  | "agent"
  | "hook"
  | "script"
  | "knowledge"
  | "rules";

export type TrustTier = "official" | "verified" | "community";

// ── Core entities ───────────────────────────────────────────

export interface Author {
  name: string;
  url?: string;
}

export interface Component {
  id: string;
  slug: string;
  name: string;
  type: ComponentType;
  description: string;
  trust_tier: TrustTier;
  version: string;
  author: Author;
  license: string;
  skill_md: string | null;
  readme_md: string | null;
  repo_url: string | null;
  install_count: number;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  slug: string;
  name: string;
  description: string;
  author: Author;
  trust_tier: TrustTier;
  harness_yaml_template: string;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  display_order: number;
}

export interface Tag {
  id: string;
  slug: string;
}

// ── Join tables ─────────────────────────────────────────────

export interface ComponentCategory {
  component_id: string;
  category_id: string;
}

export interface ComponentTag {
  component_id: string;
  tag_id: string;
}

export interface ProfileComponent {
  profile_id: string;
  component_id: string;
  pinned_version: string;
}

export interface ProfileCategory {
  profile_id: string;
  category_id: string;
}

export interface ProfileTag {
  profile_id: string;
  tag_id: string;
}

// ── Profile YAML (harness profile definitions) ─────────────

export interface ProfileYaml {
  name: string;
  description: string;
  author: Author;
  components: Array<{
    name: string;
    version: string;
  }>;
  knowledge?: {
    backend: string;
    seed_docs?: Array<{
      topic: string;
      description: string;
    }>;
  };
  rules?: string[];
}

// ── Plugin manifest (plugin.json) ───────────────────────────

export interface PluginManifest {
  name: string;
  description: string;
  version: string;
  developed_with?: string;
  tags?: string[];
  category?: string;
  requires?: {
    env?: Array<{
      name: string;
      description: string;
      required: boolean;
      sensitive: boolean;
      when: string;
    }>;
  };
}

// ── Marketplace manifest (marketplace.json) ─────────────────

export interface MarketplaceCategory {
  slug: string;
  name: string;
  display_order: number;
}

export interface MarketplacePlugin {
  name: string;
  source: string;
  description: string;
  version: string;
  author: Author;
  license: string;
  category?: string;
  tags?: string[];
}

export interface MarketplaceManifest {
  name: string;
  owner: { name: string };
  metadata: {
    description: string;
    pluginRoot: string;
  };
  categories: MarketplaceCategory[];
  plugins: MarketplacePlugin[];
}
