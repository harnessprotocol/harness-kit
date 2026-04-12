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

import type { Author } from './core.js';

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
