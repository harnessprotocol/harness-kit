import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { X } from "lucide-react";
import { Card, EmptyState, Input } from "@harness-kit/ui";
import { supabase } from "../../lib/supabase";
import MarkdownPanel from "../../components/MarkdownPanel";
import { TrustBadge, TypeBadge } from "./components/PluginBadges";
import type {
  Component,
  Category,
  ComponentType,
  ComponentCategory,
} from "@harness-kit/shared";

type ComponentTag = { component_id: string; tag_id: string };
type TagRow = { id: string; slug: string };
type SortBy = "installs" | "recent";
type RelatedComponent = Pick<Component, "id" | "slug" | "name" | "install_count">;

const COMPONENT_TYPES: ComponentType[] = [
  "skill",
  "plugin",
  "agent",
  "hook",
  "script",
  "knowledge",
  "rules",
];

const LOCAL_COMPONENTS: Component[] = [
  {
    id: "local-explain",
    slug: "explain",
    name: "Explain",
    type: "skill",
    description: "Layered code explanations for files, directories, and concepts.",
    trust_tier: "official",
    version: "0.2.0",
    author: { name: "harnessprotocol" },
    license: "Apache-2.0",
    skill_md: null,
    readme_md: "## Usage\n\nInstall with `/plugin install explain@harness-kit`, then run `/explain src/auth/`.",
    repo_url: "https://github.com/harnessprotocol/harness-kit",
    install_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "local-research",
    slug: "research",
    name: "Research",
    type: "skill",
    description: "Process sources into a structured, compounding knowledge base.",
    trust_tier: "official",
    version: "0.3.0",
    author: { name: "harnessprotocol" },
    license: "Apache-2.0",
    skill_md: null,
    readme_md: "## Usage\n\nInstall with `/plugin install research@harness-kit`, then run `/research https://...`.",
    repo_url: "https://github.com/harnessprotocol/harness-kit",
    install_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "local-review",
    slug: "review",
    name: "Review",
    type: "skill",
    description: "Comprehensive code review with severity labels and cross-file analysis.",
    trust_tier: "official",
    version: "0.2.0",
    author: { name: "harnessprotocol" },
    license: "Apache-2.0",
    skill_md: null,
    readme_md: "## Usage\n\nInstall with `/plugin install review@harness-kit`, then run `/review`.",
    repo_url: "https://github.com/harnessprotocol/harness-kit",
    install_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

export default function MarketplacePage() {
  const navigate = useNavigate();
  const { slug: selectedSlug } = useParams<{ slug?: string }>();

  // ── Resizable split ─────────────────────────────────────────
  const [listWidth, setListWidth] = useState(() => {
    const raw = localStorage.getItem("harness-kit-marketplace-split");
    const n = Number(raw);
    return (!isNaN(n) && n >= 220 && n <= 520) ? n : 300;
  });
  const splitDragging = useRef(false);
  const splitStart = useRef({ x: 0, w: 0 });
  const onSplitDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    splitDragging.current = true;
    splitStart.current = { x: e.clientX, w: listWidth };
  }, [listWidth]);
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!splitDragging.current) return;
      setListWidth(Math.min(520, Math.max(220, splitStart.current.w + e.clientX - splitStart.current.x)));
    }
    function onUp() {
      if (!splitDragging.current) return;
      splitDragging.current = false;
      localStorage.setItem("harness-kit-marketplace-split", String(listWidth));
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [listWidth]);

  // ── Master panel state ──────────────────────────────────────
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("installs");

  const [components, setComponents] = useState<Component[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [componentCategories, setComponentCategories] = useState<ComponentCategory[]>([]);
  const [componentTags, setComponentTags] = useState<ComponentTag[]>([]);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [listLoading, setListLoading] = useState(() => Boolean(supabase));
  const [listError, setListError] = useState<string | null>(null);

  // ── Detail panel state ──────────────────────────────────────
  const [detail, setDetail] = useState<Component | null>(null);
  const [detailTags, setDetailTags] = useState<string[]>([]);
  const [related, setRelated] = useState<RelatedComponent[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // ── Load list data ──────────────────────────────────────────
  useEffect(() => {
    if (!supabase) {
      setComponents(LOCAL_COMPONENTS);
      setListLoading(false);
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
        if (tagRes.error) throw tagRes.error;
        setComponents((compRes.data ?? []) as Component[]);
        setCategories((catRes.data ?? []) as Category[]);
        setComponentCategories((ccRes.data ?? []) as ComponentCategory[]);
        setComponentTags((ctRes.data ?? []) as ComponentTag[]);
        setTags((tagRes.data ?? []) as TagRow[]);
      })
      .catch((e) => setListError(String(e?.message ?? e)))
      .finally(() => setListLoading(false));
  }, []);

  // ── Load detail data ────────────────────────────────────────
  useEffect(() => {
    if (!selectedSlug) {
      setDetail(null);
      setDetailTags([]);
      setRelated([]);
      setNotFound(false);
      return;
    }

    if (!supabase) {
      const local = LOCAL_COMPONENTS.find((c) => c.slug === selectedSlug);
      setDetail(local ?? null);
      setDetailTags([]);
      setRelated(LOCAL_COMPONENTS.filter((c) => c.slug !== selectedSlug).slice(0, 5));
      setNotFound(!local);
      setDetailLoading(false);
      return;
    }

    const client = supabase;

    setDetailLoading(true);
    setNotFound(false);
    setDetail(null);
    setDetailTags([]);
    setRelated([]);

    async function load() {
      try {
        const { data, error } = await client
          .from("components")
          .select("*")
          .eq("slug", selectedSlug!)
          .single();

        if (error || !data) {
          setNotFound(true);
          return;
        }

        const comp = data as Component;
        setDetail(comp);

        const { data: tagRows } = await client
          .from("component_tags")
          .select("tag_id, tags(slug)")
          .eq("component_id", comp.id);

        if (tagRows) {
          setDetailTags(
            tagRows
              .map((row: Record<string, unknown>) => (row.tags as { slug: string })?.slug ?? "")
              .filter(Boolean),
          );
        }

        const { data: relatedData } = await client
          .from("components")
          .select("id, slug, name, install_count")
          .eq("type", comp.type)
          .neq("id", comp.id)
          .order("install_count", { ascending: false })
          .limit(5);

        setRelated((relatedData ?? []) as RelatedComponent[]);
      } catch {
        setNotFound(true);
      } finally {
        setDetailLoading(false);
      }
    }

    void load();
  }, [selectedSlug]);

  // ── Filter + sort list ──────────────────────────────────────
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

  const updatedDate = detail?.updated_at
    ? new Date(detail.updated_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* ── Master panel ── */}
      <div style={{
        width: listWidth,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid var(--border-base)",
        overflow: "hidden",
      }}>
        {/* Fixed header + filters */}
        <div style={{ padding: "20px 20px 0", flexShrink: 0 }}>
          <PageHeader />

          {!supabase && (
            <Card
              padding="sm"
              style={{
                background: "var(--warning-light)",
                marginBottom: "12px",
                fontSize: "11px",
                lineHeight: 1.45,
                color: "var(--fg-muted)",
              }}
            >
              <strong style={{ color: "var(--fg-base)" }}>Supabase not configured.</strong>{" "}
              Showing a local demo catalog. Add{" "}
              <code style={{ fontFamily: "ui-monospace, monospace" }}>VITE_SUPABASE_URL</code> and{" "}
              <code style={{ fontFamily: "ui-monospace, monospace" }}>VITE_SUPABASE_ANON_KEY</code> to use the live marketplace.
            </Card>
          )}

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
              <button className="hk-reset-btn" onClick={() => setSelectedTag("")} style={{ display: "inline-flex", alignItems: "center", gap: "3px", cursor: "pointer", fontSize: "11px", color: "var(--fg-subtle)" }}>
                <X size={11} strokeWidth={1.7} />
                clear
              </button>
            </div>
          )}

          {/* Search */}
          <div style={{ marginBottom: "12px" }}>
            <Input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search plugins…"
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
              {listLoading ? "" : `${filtered.length} plugin${filtered.length === 1 ? "" : "s"}`}
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
        </div>

        {/* Scrollable list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 20px" }}>
          {listLoading && (
            <p style={{ fontSize: "13px", color: "var(--fg-subtle)" }}>Loading…</p>
          )}

          {listError && (
            <Card padding="sm" style={{ fontSize: "13px", color: "var(--danger)" }}>
              {listError}
            </Card>
          )}

          {!listLoading && !listError && filtered.length === 0 && (
            <EmptyState
              icon={
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" strokeWidth="1.5">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" />
                  <path d="M16.5 16.5L21 21" stroke="currentColor" strokeLinecap="round" />
                </svg>
              }
              title="No plugins found"
            />
          )}

          {!listLoading && !listError && filtered.length > 0 && (
            <div className="row-list">
              {filtered.map((plugin) => (
                <button
                  key={plugin.id}
                  className={`row-list-item${selectedSlug === plugin.slug ? " selected" : ""}`}
                  onClick={() => navigate(`/marketplace/${plugin.slug}`, { replace: true })}
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
                        maxWidth: "280px",
                      }}>
                        {plugin.description}
                      </p>
                    )}
                  </div>
                  <div style={{ flexShrink: 0, marginLeft: "12px", textAlign: "right" }}>
                    <div style={{ fontSize: "11px", fontFamily: "ui-monospace, monospace", color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums" }}>
                      v{plugin.version}
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--fg-subtle)", marginTop: "1px", fontVariantNumeric: "tabular-nums" }}>
                      {plugin.install_count.toLocaleString()} installs
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Resize handle ── */}
      <div
        onMouseDown={onSplitDown}
        style={{ width: 4, flexShrink: 0, cursor: "col-resize", background: "transparent", transition: "background 0.12s", zIndex: 1 }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      />

      {/* ── Detail panel ── */}
      <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
        {!selectedSlug ? (
          <div style={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <p style={{ fontSize: "13px", color: "var(--fg-subtle)" }}>
              Select a plugin to view details
            </p>
          </div>
        ) : detailLoading ? (
          <div style={{ padding: "20px 24px" }}>
            <p style={{ fontSize: "13px", color: "var(--fg-subtle)" }}>Loading…</p>
          </div>
        ) : notFound || !detail ? (
          <div style={{ padding: "20px 24px" }}>
            <Card padding="lg" style={{ textAlign: "center" }}>
              <p style={{ fontSize: "13px", color: "var(--fg-muted)", margin: 0 }}>
                Plugin not found.
              </p>
            </Card>
          </div>
        ) : (
          <div style={{ padding: "20px 24px" }}>
            {/* Close button */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
              <button
                className="hk-reset-btn"
                onClick={() => navigate("/marketplace", { replace: true })}
                aria-label="Close detail panel"
                style={{
                  cursor: "pointer",
                  color: "var(--fg-subtle)",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  lineHeight: 1,
                }}
              >
                <X size={16} strokeWidth={1.7} />
              </button>
            </div>

            {/* Header */}
            <div style={{ marginBottom: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <h1 style={{
                  fontSize: "17px",
                  fontWeight: 600,
                  letterSpacing: "-0.3px",
                  color: "var(--fg-base)",
                  margin: 0,
                }}>
                  {detail.name}
                </h1>
                <TrustBadge tier={detail.trust_tier} />
                <TypeBadge type={detail.type} />
              </div>
              {/* Description hero */}
              <Card padding="sm" style={{ marginTop: "10px" }}>
                <p style={{ fontSize: "13px", color: "var(--fg-muted)", margin: 0 }}>
                  {detail.description}
                </p>
              </Card>
            </div>

            {/* Stats bar */}
            <div style={{
              display: "flex",
              gap: "14px",
              flexWrap: "wrap",
              fontSize: "11px",
              color: "var(--fg-subtle)",
              marginBottom: "14px",
            }}>
              <span>{detail.install_count.toLocaleString()} installs</span>
              <span style={{ fontFamily: "ui-monospace, monospace" }}>v{detail.version}</span>
              {detail.license && <span>{detail.license}</span>}
              {updatedDate && <span>Updated {updatedDate}</span>}
            </div>

            {/* Tags */}
            {detailTags.length > 0 && (
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "20px" }}>
                {detailTags.map((tag) => (
                  <button
                    key={tag}
                    className="hk-reset-btn"
                    onClick={() => setSelectedTag(tag)}
                    style={{
                      fontSize: "10px",
                      padding: "2px 8px",
                      borderRadius: "10px",
                      background: "var(--bg-elevated)",
                      color: "var(--fg-subtle)",
                      cursor: "pointer",
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
              {/* Main column */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Install command */}
                <Card padding="sm" style={{ marginBottom: "16px" }}>
                  <p style={{
                    fontSize: "10px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--fg-subtle)",
                    margin: "0 0 6px",
                  }}>
                    Install
                  </p>
                  <code style={{
                    display: "block",
                    background: "var(--bg-base)",
                    borderRadius: "5px",
                    padding: "7px 9px",
                    fontSize: "10px",
                    fontFamily: "ui-monospace, monospace",
                    color: "var(--accent-text)",
                    wordBreak: "break-all",
                  }}>
                    /plugin install {detail.slug}@harness-kit
                  </code>
                </Card>

                {detail.skill_md && (
                  <MarkdownPanel content={detail.skill_md} title="Skill Definition" />
                )}

                {detail.readme_md && (
                  <MarkdownPanel content={detail.readme_md} title="Documentation" />
                )}
              </div>

              {/* Sidebar */}
              <aside style={{ width: "200px", flexShrink: 0 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {/* Author */}
                  {detail.author?.name && (
                    <Card padding="sm">
                      <p style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "var(--fg-subtle)",
                        margin: "0 0 6px",
                      }}>Author</p>
                      {detail.author.url ? (
                        <a
                          href={detail.author.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: "12px", color: "var(--accent-text)", textDecoration: "none" }}
                        >
                          {detail.author.name}
                        </a>
                      ) : (
                        <span style={{ fontSize: "12px", color: "var(--fg-base)" }}>
                          {detail.author.name}
                        </span>
                      )}
                    </Card>
                  )}

                  {/* GitHub link */}
                  {detail.repo_url && (
                    <Card padding="sm">
                      <a
                        href={detail.repo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "12px",
                          color: "var(--fg-muted)",
                          textDecoration: "none",
                        }}
                      >
                        <GitHubIcon />
                        View on GitHub
                      </a>
                    </Card>
                  )}

                  {/* Related plugins */}
                  {related.length > 0 && (
                    <Card padding="sm">
                      <p style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "var(--fg-subtle)",
                        margin: "0 0 6px",
                      }}>Related</p>
                      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                        {related.map((r) => (
                          <li key={r.id} style={{ marginBottom: "6px" }}>
                            <button
                              className="hk-reset-btn"
                              onClick={() => navigate(`/marketplace/${r.slug}`, { replace: true })}
                              style={{
                                cursor: "pointer",
                                display: "flex",
                                justifyContent: "space-between",
                                width: "100%",
                                gap: "6px",
                              }}
                            >
                              <span style={{
                                fontSize: "12px",
                                color: "var(--accent-text)",
                                textAlign: "left",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}>
                                {r.name}
                              </span>
                              <span style={{ fontSize: "10px", color: "var(--fg-subtle)", flexShrink: 0 }}>
                                {r.install_count.toLocaleString()}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  )}
                </div>
              </aside>
            </div>
          </div>
        )}
      </div>
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

function GitHubIcon() {
  return (
    <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}
