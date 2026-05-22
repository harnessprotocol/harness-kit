import type { MarketplaceData, MarketplacePlugin, MarketplaceSource } from "./types.js";

/**
 * Wraps a generated {@link MarketplaceData} blob as a {@link MarketplaceSource}.
 * This is the only source today; the browse layer composes an array of sources
 * so a future client-side remote source merges in behind the same interface.
 */
export class StaticSource implements MarketplaceSource {
  readonly id: string;

  constructor(private readonly data: MarketplaceData, id = "first-party") {
    this.id = id;
  }

  listPlugins(): MarketplacePlugin[] {
    return this.data.plugins;
  }
}
