import { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import type {
  Component,
  Category,
  ComponentType,
  ComponentCategory,
} from "@harness-kit/shared";

type ComponentTag = { component_id: string; tag_id: string };
type TagRow = { id: string; slug: string };
type SortBy = "installs" | "recent";

const COMPONENT_TYPES: ComponentType[] = [
  "skill",
  "agent",
  "hook",
  "script",
  "knowledge",
  "rules",
];

function TrustBadge({ tier }: { tier: Component["trust_tier"] }) {
  const colors: Record<Component["trust_tier"], { bg: string; color: string }> = {
    official: { bg: "rgba(59,130,246,0.12)", color: "#3b82f6" },
    verified: { bg: "rgba(34,197,94,0.12)", color: "#16a34a" },
    community: { bg: "var(--bg-base)", color: "var(--fg-subtle)" },
  };
  const c = colors[tier];
  return (
    <span style={{
      fontSize: "10px",
      fontWeight: 500,
      padding: "1px 6px",
      borderRadius: "10px",
      background: c.bg,
      color: c.color,
      border: `1px solid ${c.color}30`,
      letterSpacing: "0.01em",
    }}>
      {tier}
    </span>
  );
}

function TypeBadge({ type }: { type: ComponentType }) {
  return (
    <span style={{
      fontSize: "10px",
      fontWeight: 400,
      padding: "1px 6px",
      borderRadius: "10px",
      border: "1px solid var(--border-base)",
      color: "var(--fg-subtle)",
      textTransform: "capitalize",
    }}>
      {type}
    </span>
  );
}

export default function BrowsePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedTag, setSelectedTag] = useState(() => searchParams.get("tag") ?? "");
  const [sortBy, setSortBy] = useState<SortBy>("installs");

  const [components, setComponents] = useState<Component[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [componentCategories, setComponentCategories] = useState<ComponentCategory[]>([]);
  const [componentTags, setComponentTags] = useState<ComponentTag[]>([]);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    Promise.all([
      supabase.from("components").select("id, slug, name, type, description, trust_tier, version, author, license, install_count, updated_at"),
      supabase.from("categories").select("*").order("display_order"),
      supabase.from("component_categories").select("component_id, category_id"),
      supabase.from("component_tags").select("component_id, tag_id"),
      supabase.from("tags").select("id, slug"),
    ])
      .then(([compRes, catRes, ccRes, ctRes, tagRes]) => {
        if (compRes.error) throw compRes.error;
        if (catRes.error) throw catRes.error;
        if (ccRes.error) throw ccRes.error;
        if (ctRes.error) throw ctRes.error;
        setComponents((compRes.data ?? []) as Component[]);
        setCategories((catRes.data ?? []) as Category[]);
        setComponentCategories((ccRes.data ?? []) as ComponentCategory[]);
        setComponentTags((ctRes.data ?? []) as ComponentTag[]);
        setTags((tagRes.data ?? []) as TagRow[]);
      })
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let results = [...components];

    if (query.trim()) {
      const q = query.toLowerCase();
      results = results.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q),
      );
    }

    if (selectedCategory) {
      const catObj = categories.find((c) => c.slug === selectedCategory);
      if (catObj) {
        const ids = new Set(
          componentCategories
            .filter((cc) => cc.category_id === catObj.id)
            .map((cc) => cc.component_id),
        );
        results = results.filter((c) => ids.has(c.id));
      }
    }

    if (selectedTag) {
      const tagObj = tags.find((t) => t.slug === selectedTag);
      if (tagObj) {
        const ids = new Set(
          componentTags
            .filter((ct) => ct.tag_id === tagObj.id)
            .map((ct) => ct.component_id),
        );
        results = results.filter((c) => ids.has(c.id));
      }
    }

    if (selectedType) {
      results = results.filter((c) => c.type === selectedType);
    }

    if (sortBy === "recent") {
      results.sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      );
    } else {
      results.sort((a, b) => b.install_count - a.install_count);
    }

    return results;
  }, [components, categories, componentCategories, componentTags, tags, query, selectedCategory, selectedTag, selectedType, sortBy]);

  function toggleCategory(slug: string) {
    setSelectedCategory((prev) => (prev === slug ? "" : slug));
  }

  function toggleType(type: string) {
    setSelectedType((prev) => (prev === type ? "" : type));
  }

  function pillStyle(active: boolean) {
    return {
      fontSize: "11px",
      fontWeight: active ? 500 : 400,
      padding: "3px 10px",
      borderRadius: "12px",
      border: "1px solid var(--border-base)",
      background: active ? "var(--accent-light)" : "transparent",
      color: active ? "var(--accent-text)" : "var(--fg-muted)",
      cursor: "pointer",
      transition: "background 0.1s, color 0.1s",
      whiteSpace: "nowrap" as const,
      flexShrink: 0,
    };
  }

  function sortTabStyle(active: boolean) {
    return {
      fontSize: "11px",
      fontWeight: active ? 500 : 400,
      padding: "3px 10px",
      borderRadius: "6px",
      border: "none",
      background: active ? "var(--active-bg)" : "transparent",
      color: active ? "var(--fg-base)" : "var(--fg-subtle)",
      cursor: "pointer",
    };
  }

  if (!supabase) {
    return (
      <div style={{ padding: "20px 24px" }}>
        <PageHeader />
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "8px",
          padding: "32px 16px",
          textAlign: "center",
        }}>
          <p style={{ fontSize: "13px", color: "var(--fg-muted)", margin: 0 }}>
            Supabase not configured.
          </p>
          <p style={{ fontSize: "11px", color: "var(--fg-subtle)", margin: "4px 0 0" }}>
            Add <code style={{ fontFamily: "ui-monospace, monospace" }}>VITE_SUPABASE_URL</code> and{" "}
            <code style={{ fontFamily: "ui-monospace, monospace" }}>VITE_SUPABASE_ANON_KEY</code> to{" "}
            <code style={{ fontFamily: "ui-monospace, monospace" }}>apps/desktop/.env</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 24px" }}>
      <PageHeader />

      {/* Active tag filter banner */}
      {selectedTag && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginBottom: "10px",
          fontSize: "11px",
          color: "var(--fg-muted)",
        }}>
          <span>Filtered by tag:</span>
          <span style={{
            padding: "1px 8px",
            borderRadius: "10px",
            border: "1px solid var(--accent)",
            color: "var(--accent-text)",
            fontSize: "10px",
          }}>
            {selectedTag}
          </span>
          <button
            onClick={() => setSelectedTag("")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "11px",
              color: "var(--fg-subtle)",
              padding: 0,
            }}
          >
            ✕ clear
          </button>
        </div>
      )}

      {/* Search */}
      <div style={{ marginBottom: "12px" }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search plugins…"
          style={{
            width: "100%",
            padding: "6px 10px",
            borderRadius: "6px",
            border: "1px solid var(--border-base)",
            background: "var(--bg-surface)",
            color: "var(--fg-base)",
            fontSize: "13px",
            outline: "none",
          }}
        />
      </div>

      {/* Category pills */}
      {categories.length > 0 && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
          {categories.map((cat) => (
            <button
              key={cat.slug}
              onClick={() => toggleCategory(cat.slug)}
              aria-pressed={selectedCategory === cat.slug}
              style={pillStyle(selectedCategory === cat.slug)}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Type pills */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "14px" }}>
        {COMPONENT_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => toggleType(t)}
            aria-pressed={selectedType === t}
            style={pillStyle(selectedType === t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Sort + count */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "10px",
      }}>
        <span style={{ fontSize: "11px", color: "var(--fg-subtle)" }}>
          {loading ? "" : `${filtered.length} plugin${filtered.length === 1 ? "" : "s"}`}
        </span>
        <div style={{ display: "flex", gap: "2px" }}>
          <button onClick={() => setSortBy("installs")} style={sortTabStyle(sortBy === "installs")}>
            Installs
          </button>
          <button onClick={() => setSortBy("recent")} style={sortTabStyle(sortBy === "recent")}>
            Recent
          </button>
        </div>
      </div>

      {loading && (
        <p style={{ fontSize: "13px", color: "var(--fg-subtle)" }}>Loading…</p>
      )}

      {error && (
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "8px",
          padding: "10px 14px",
          fontSize: "13px",
          color: "var(--danger)",
        }}>
          {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "8px",
          padding: "32px 16px",
          textAlign: "center",
        }}>
          <p style={{ fontSize: "13px", color: "var(--fg-muted)", margin: 0 }}>
            No plugins found.
          </p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="row-list">
          {filtered.map((plugin) => (
            <button
              key={plugin.id}
              className="row-list-item"
              onClick={() => navigate(`/marketplace/${plugin.slug}`)}
              style={{
                justifyContent: "space-between",
                width: "100%",
                background: "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--fg-base)" }}>
                    {plugin.name}
                  </span>
                  <TrustBadge tier={plugin.trust_tier} />
                  <TypeBadge type={plugin.type} />
                </div>
                {plugin.description && (
                  <p style={{
                    fontSize: "11px",
                    color: "var(--fg-muted)",
                    margin: "2px 0 0",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "380px",
                  }}>
                    {plugin.description}
                  </p>
                )}
              </div>
              <div style={{ flexShrink: 0, marginLeft: "12px", textAlign: "right" }}>
                <div style={{ fontSize: "11px", fontFamily: "ui-monospace, monospace", color: "var(--fg-subtle)" }}>
                  v{plugin.version}
                </div>
                <div style={{ fontSize: "10px", color: "var(--fg-subtle)", marginTop: "1px" }}>
                  {plugin.install_count.toLocaleString()} installs
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PageHeader() {
  return (
    <div style={{ marginBottom: "16px" }}>
      <h1 style={{
        fontSize: "17px",
        fontWeight: 600,
        letterSpacing: "-0.3px",
        color: "var(--fg-base)",
        margin: 0,
      }}>
        Browse Plugins
      </h1>
      <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: "3px 0 0" }}>
        Skills, agents, hooks, and scripts from the harness-kit registry.
      </p>
    </div>
  );
}
