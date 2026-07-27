import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { X } from "lucide-react";
import { Card, EmptyState, Input } from "@harness-kit/ui";
import type { MarketplaceCategory, MarketplacePlugin } from "@harness-kit/marketplace-data";
import {
  getAllPlugins,
  getCategories,
  getCategoryName,
  getPlugin,
  pluginRepoUrl,
  relatedPlugins,
} from "../../lib/marketplace/data";
import MarkdownPanel from "../../components/MarkdownPanel";
import { TrustBadge, CategoryBadge } from "./components/PluginBadges";

const ALL_PLUGINS = getAllPlugins();
const ALL_CATEGORIES = getCategories();

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
  const [selectedTag, setSelectedTag] = useState("");

  // Catalog is a build-time generated JSON (see ../../lib/marketplace/data.ts)
  // bundled into the app, not fetched — no loading/error state needed.
  const [categories] = useState<MarketplaceCategory[]>(ALL_CATEGORIES);

  // ── Detail panel state ──────────────────────────────────────
  const detail: MarketplacePlugin | undefined = selectedSlug ? getPlugin(selectedSlug) : undefined;
  const notFound = Boolean(selectedSlug) && !detail;
  const related = detail ? relatedPlugins(detail) : [];

  // ── Filter + sort list ──────────────────────────────────────
  const filtered = useMemo(() => {
    let results = [...ALL_PLUGINS];

    if (query.trim()) {
      const q = query.toLowerCase();
      results = results.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q),
      );
    }

    if (selectedCategory) {
      results = results.filter((p) => p.category === selectedCategory);
    }

    if (selectedTag) {
      results = results.filter((p) => p.tags.includes(selectedTag));
    }

    return results.sort((a, b) => a.name.localeCompare(b.name));
  }, [query, selectedCategory, selectedTag]);

  function toggleCategory(slug: string) {
    setSelectedCategory((prev) => (prev === slug ? "" : slug));
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

          {/* Count */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "10px",
          }}>
            <span style={{ fontSize: "11px", color: "var(--fg-subtle)" }}>
              {filtered.length} plugin{filtered.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        {/* Scrollable list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 20px" }}>
          {filtered.length === 0 && (
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

          {filtered.length > 0 && (
            <div className="row-list">
              {filtered.map((plugin) => (
                <button
                  key={plugin.slug}
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
                      <TrustBadge tier={plugin.security.trust} />
                      <CategoryBadge name={getCategoryName(plugin.category)} />
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
                <TrustBadge tier={detail.security.trust} />
                <CategoryBadge name={getCategoryName(detail.category)} />
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
              <span style={{ fontFamily: "ui-monospace, monospace" }}>v{detail.version}</span>
              {detail.license && <span>{detail.license}</span>}
            </div>

            {/* Security scan summary */}
            {detail.security.summary && (
              <Card padding="sm" style={{ marginBottom: "14px" }}>
                <p style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--fg-subtle)",
                  margin: "0 0 6px",
                }}>
                  Security scan
                </p>
                <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: 0 }}>
                  {detail.security.summary}
                </p>
              </Card>
            )}

            {/* Tags */}
            {detail.tags.length > 0 && (
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "20px" }}>
                {detail.tags.map((tag) => (
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
                    {detail.installCommand}
                  </code>
                </Card>

                {/* Required environment variables */}
                {detail.requiresEnv.length > 0 && (
                  <Card padding="sm" style={{ marginBottom: "16px" }}>
                    <p style={{
                      fontSize: "10px",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--fg-subtle)",
                      margin: "0 0 8px",
                    }}>
                      Requires
                    </p>
                    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
                      {detail.requiresEnv.map((env) => (
                        <li key={env.name}>
                          <code style={{ fontSize: "11px", fontFamily: "ui-monospace, monospace", color: "var(--fg-base)" }}>
                            {env.name}
                          </code>
                          {!env.required && (
                            <span style={{ fontSize: "10px", color: "var(--fg-subtle)" }}> (optional)</span>
                          )}
                          <p style={{ fontSize: "11px", color: "var(--fg-muted)", margin: "2px 0 0" }}>
                            {env.description}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}

                {/* Bundled MCP server */}
                {detail.mcp && (
                  <Card padding="sm" style={{ marginBottom: "16px" }}>
                    <p style={{
                      fontSize: "10px",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--fg-subtle)",
                      margin: "0 0 6px",
                    }}>
                      Bundled MCP server
                    </p>
                    <code style={{ fontSize: "11px", fontFamily: "ui-monospace, monospace", color: "var(--fg-base)" }}>
                      {detail.mcp.command}{detail.mcp.args.length > 0 ? ` ${detail.mcp.args.join(" ")}` : ""}
                    </code>
                  </Card>
                )}

                {/* Skills */}
                {detail.skills.map((skill) => (
                  <MarkdownPanel key={skill.dir} content={skill.body} title={skill.name} />
                ))}
              </div>

              {/* Sidebar */}
              <aside style={{ width: "200px", flexShrink: 0 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {/* Author */}
                  <Card padding="sm">
                    <p style={{
                      fontSize: "10px",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--fg-subtle)",
                      margin: "0 0 6px",
                    }}>Author</p>
                    <span style={{ fontSize: "12px", color: "var(--fg-base)" }}>
                      {detail.author}
                    </span>
                  </Card>

                  {/* GitHub link */}
                  <Card padding="sm">
                    <a
                      href={pluginRepoUrl(detail)}
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
                          <li key={r.slug} style={{ marginBottom: "6px" }}>
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
