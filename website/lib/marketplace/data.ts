import generated from './marketplace.generated.json';
import type {
  MarketplaceCategory,
  MarketplaceData,
  MarketplacePlugin,
  MarketplaceSource,
} from './types';

const data = generated as MarketplaceData;

/** Wraps the build-time generated data as a {@link MarketplaceSource}. */
export class StaticSource implements MarketplaceSource {
  readonly id: string;

  constructor(private readonly source: MarketplaceData = data, id = 'first-party') {
    this.id = id;
  }

  listPlugins(): MarketplacePlugin[] {
    return this.source.plugins;
  }
}

/**
 * Merges plugins from every source. Today there is one (the static source);
 * this is the seam where a future remote source joins the same browse UI.
 */
export async function getMarketplace(
  sources: MarketplaceSource[] = [new StaticSource()],
): Promise<MarketplacePlugin[]> {
  const lists = await Promise.all(sources.map((s) => s.listPlugins()));
  return lists.flat();
}

export function getAllPlugins(): MarketplacePlugin[] {
  return data.plugins;
}

export function getPlugin(slug: string): MarketplacePlugin | undefined {
  return data.plugins.find((p) => p.slug === slug);
}

export function getCategories(): MarketplaceCategory[] {
  return data.categories;
}

export function getCategoryName(slug: string): string {
  return data.categories.find((c) => c.slug === slug)?.name ?? slug;
}

export function getAllTags(): string[] {
  return [...new Set(data.plugins.flatMap((p) => p.tags))].sort();
}

export function getMarketplaceMeta(): Pick<MarketplaceData, 'marketplaceName' | 'owner' | 'generatedAt'> {
  return {
    marketplaceName: data.marketplaceName,
    owner: data.owner,
    generatedAt: data.generatedAt,
  };
}
