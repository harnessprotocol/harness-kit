import Link from "next/link";
import type { ComponentType, TrustTier } from "@/lib/types";

const CATEGORIES = [
  { slug: "research-knowledge", name: "Research & Knowledge" },
  { slug: "code-quality", name: "Code Quality" },
  { slug: "data-engineering", name: "Data Engineering" },
  { slug: "documentation", name: "Documentation" },
  { slug: "devops", name: "DevOps & Shipping" },
  { slug: "productivity", name: "Productivity" },
];

const COMPONENT_TYPES: ComponentType[] = ["skill", "agent", "hook", "script", "knowledge", "rules"];

const TRUST_TIERS: TrustTier[] = ["official", "verified", "community"];

interface FilterPanelProps {
  selectedCategory?: string;
  selectedType?: string;
  selectedTrust?: string;
  buildUrl: (overrides: Record<string, string>) => string;
}

export function FilterPanel({
  selectedCategory = "",
  selectedType = "",
  selectedTrust = "",
  buildUrl,
}: FilterPanelProps) {
  return (
    <aside className="hidden w-52 shrink-0 space-y-6 lg:block">
      {/* Category filter */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
          Category
        </h3>
        <ul className="space-y-1">
          {CATEGORIES.map((cat) => (
            <li key={cat.slug}>
              <Link
                href={buildUrl({
                  category: selectedCategory === cat.slug ? "" : cat.slug,
                })}
                className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${
                  selectedCategory === cat.slug
                    ? "bg-violet-500/20 text-violet-400"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                {cat.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* Type filter */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">Type</h3>
        <ul className="space-y-1">
          {COMPONENT_TYPES.map((t) => (
            <li key={t}>
              <Link
                href={buildUrl({
                  type: selectedType === t ? "" : t,
                })}
                className={`block rounded-md px-3 py-1.5 text-sm capitalize transition-colors ${
                  selectedType === t
                    ? "bg-violet-500/20 text-violet-400"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                {t}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* Trust tier filter */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
          Trust Tier
        </h3>
        <ul className="space-y-1">
          {TRUST_TIERS.map((tier) => (
            <li key={tier}>
              <Link
                href={buildUrl({
                  trust: selectedTrust === tier ? "" : tier,
                })}
                className={`block rounded-md px-3 py-1.5 text-sm capitalize transition-colors ${
                  selectedTrust === tier
                    ? "bg-violet-500/20 text-violet-400"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                {tier}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
