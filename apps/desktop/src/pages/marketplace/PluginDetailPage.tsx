import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import DOMPurify from "dompurify";
import { supabase } from "../../lib/supabase";
import type { Component } from "@harness-kit/shared";

type RelatedComponent = Pick<Component, "id" | "slug" | "name" | "install_count">;

/**
 * Minimal markdown-to-HTML renderer.
 * Output is always passed through DOMPurify before injection.
 * Uses CSS variable-based inline styles to match the macOS HIG design system.
 */
function renderMarkdown(md: string): string {
  const raw = md
    // Fenced code blocks (must run before inline code)
    .replace(
      /```(\w*)\n?([\s\S]*?)```/g,
      '<pre style="overflow-x:auto;border-radius:6px;background:var(--bg-base);border:1px solid var(--border-base);padding:12px 14px;font-size:11px;font-family:ui-monospace,monospace;line-height:1.6;margin:10px 0"><code>$2</code></pre>',
    )
    // Headings
    .replace(
      /^#### (.+)$/gm,
      '<h4 style="font-size:12px;font-weight:600;margin:16px 0 4px;color:var(--fg-base)">$1</h4>',
    )
    .replace(
      /^### (.+)$/gm,
      '<h3 style="font-size:13px;font-weight:600;margin:20px 0 6px;color:var(--fg-base)">$1</h3>',
    )
    .replace(
      /^## (.+)$/gm,
      '<h2 style="font-size:14px;font-weight:700;margin:24px 0 8px;color:var(--fg-base)">$1</h2>',
    )
    .replace(
      /^# (.+)$/gm,
      '<h1 style="font-size:15px;font-weight:700;margin:0 0 10px;color:var(--fg-base)">$1</h1>',
    )
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Inline code
    .replace(
      /`([^`]+)`/g,
      '<code style="border-radius:4px;background:var(--bg-base);padding:1px 5px;font-size:11px;font-family:ui-monospace,monospace;color:var(--accent-text)">$1</code>',
    )
    // Links
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" style="color:var(--accent-text);text-decoration:underline" target="_blank" rel="noopener noreferrer">$1</a>',
    )
    // Unordered lists
    .replace(
      /^- (.+)$/gm,
      '<li style="margin-left:16px;list-style-type:disc;color:var(--fg-muted);margin-bottom:2px">$1</li>',
    )
    // Paragraphs (skip lines that start with HTML tags)
    .replace(
      /^(?!<[hluop]|<li|<pre|<code|<strong|<a)(.+)$/gm,
      '<p style="margin:0 0 8px;color:var(--fg-muted)">$1</p>',
    );

  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ["h1", "h2", "h3", "h4", "p", "pre", "code", "strong", "a", "li", "ul", "ol"],
    ALLOWED_ATTR: ["href", "target", "rel", "style"],
    ALLOW_DATA_ATTR: false,
  });
}

function TrustBadge({ tier }: { tier: Component["trust_tier"] }) {
  const colors: Record<Component["trust_tier"], { bg: string; color: string }> = {
    official: { bg: "rgba(59,130,246,0.12)", color: "#3b82f6" },
    verified: { bg: "rgba(34,197,94,0.12)", color: "#16a34a" },
    community: { bg: "var(--bg-base)", color: "var(--fg-subtle)" },
  };
  const c = colors[tier];
  return (
    <span style={{
      fontSize: "11px",
      fontWeight: 500,
      padding: "2px 8px",
      borderRadius: "10px",
      background: c.bg,
      color: c.color,
      border: `1px solid ${c.color}30`,
    }}>
      {tier}
    </span>
  );
}

function TypeBadge({ type }: { type: Component["type"] }) {
  return (
    <span style={{
      fontSize: "11px",
      fontWeight: 400,
      padding: "2px 8px",
      borderRadius: "10px",
      border: "1px solid var(--border-base)",
      color: "var(--fg-subtle)",
      textTransform: "capitalize",
    }}>
      {type}
    </span>
  );
}

export default function PluginDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [component, setComponent] = useState<Component | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [related, setRelated] = useState<RelatedComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!supabase || !slug) {
      setLoading(false);
      return;
    }

    const client = supabase;

    async function load() {
      try {
        const { data, error } = await client
          .from("components")
          .select("*")
          .eq("slug", slug!)
          .single();

        if (error || !data) {
          setNotFound(true);
          return;
        }

        const comp = data as Component;
        setComponent(comp);

        // Fetch tags for this component
        const { data: tagRows } = await client
          .from("component_tags")
          .select("tag_id, tags(slug)")
          .eq("component_id", comp.id);

        if (tagRows) {
          setTags(
            tagRows
              .map((row: Record<string, unknown>) => (row.tags as { slug: string })?.slug ?? "")
              .filter(Boolean),
          );
        }

        // Fetch related components (same type, excluding self)
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
        setLoading(false);
      }
    }

    void load();
  }, [slug]);

  if (!supabase) {
    return (
      <div style={{ padding: "20px 24px" }}>
        <BackButton onClick={() => navigate("/marketplace")} />
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "8px",
          padding: "32px 16px",
          textAlign: "center",
          marginTop: "16px",
        }}>
          <p style={{ fontSize: "13px", color: "var(--fg-muted)", margin: 0 }}>
            Supabase not configured.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: "20px 24px" }}>
        <BackButton onClick={() => navigate("/marketplace")} />
        <p style={{ fontSize: "13px", color: "var(--fg-subtle)", marginTop: "16px" }}>Loading…</p>
      </div>
    );
  }

  if (notFound || !component) {
    return (
      <div style={{ padding: "20px 24px" }}>
        <BackButton onClick={() => navigate("/marketplace")} />
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "8px",
          padding: "32px 16px",
          textAlign: "center",
          marginTop: "16px",
        }}>
          <p style={{ fontSize: "13px", color: "var(--fg-muted)", margin: 0 }}>
            Plugin not found.
          </p>
        </div>
      </div>
    );
  }

  const updatedDate = component.updated_at
    ? new Date(component.updated_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const skillHtml = component.skill_md ? renderMarkdown(component.skill_md) : null;
  const readmeHtml = component.readme_md ? renderMarkdown(component.readme_md) : null;

  return (
    <div style={{ padding: "20px 24px" }}>
      <BackButton onClick={() => navigate("/marketplace")} />

      <div style={{ display: "flex", gap: "24px", marginTop: "16px", alignItems: "flex-start" }}>
        {/* ── Main column ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
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
                {component.name}
              </h1>
              <TrustBadge tier={component.trust_tier} />
              <TypeBadge type={component.type} />
            </div>
            <p style={{ fontSize: "13px", color: "var(--fg-muted)", margin: "6px 0 0" }}>
              {component.description}
            </p>
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
            <span>{component.install_count.toLocaleString()} installs</span>
            <span style={{ fontFamily: "ui-monospace, monospace" }}>v{component.version}</span>
            {component.license && <span>{component.license}</span>}
            {updatedDate && <span>Updated {updatedDate}</span>}
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "20px" }}>
              {tags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => navigate(`/marketplace?tag=${tag}`)}
                  style={{
                    fontSize: "10px",
                    padding: "2px 8px",
                    borderRadius: "10px",
                    border: "1px solid var(--border-base)",
                    background: "transparent",
                    color: "var(--fg-subtle)",
                    cursor: "pointer",
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          {/* SKILL.md — sanitized with DOMPurify */}
          {skillHtml && (
            <section style={{ marginBottom: "24px" }}>
              <p style={{
                fontSize: "10px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--fg-subtle)",
                margin: "0 0 8px",
              }}>
                Skill Definition
              </p>
              <div
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-base)",
                  borderRadius: "8px",
                  padding: "14px 16px",
                  fontSize: "12px",
                  lineHeight: "1.55",
                }}
                dangerouslySetInnerHTML={{ __html: skillHtml }}
              />
            </section>
          )}

          {/* README.md — sanitized with DOMPurify */}
          {readmeHtml && (
            <section style={{ marginBottom: "24px" }}>
              <p style={{
                fontSize: "10px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--fg-subtle)",
                margin: "0 0 8px",
              }}>
                Documentation
              </p>
              <div
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-base)",
                  borderRadius: "8px",
                  padding: "14px 16px",
                  fontSize: "12px",
                  lineHeight: "1.55",
                }}
                dangerouslySetInnerHTML={{ __html: readmeHtml }}
              />
            </section>
          )}
        </div>

        {/* ── Sidebar ── */}
        <aside style={{ width: "200px", flexShrink: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* Install command */}
            <SidebarCard>
              <SidebarLabel>Install</SidebarLabel>
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
                /plugin install {component.slug}@harness-kit
              </code>
            </SidebarCard>

            {/* Author */}
            {component.author?.name && (
              <SidebarCard>
                <SidebarLabel>Author</SidebarLabel>
                {component.author.url ? (
                  <a
                    href={component.author.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: "12px", color: "var(--accent-text)", textDecoration: "none" }}
                  >
                    {component.author.name}
                  </a>
                ) : (
                  <span style={{ fontSize: "12px", color: "var(--fg-base)" }}>
                    {component.author.name}
                  </span>
                )}
              </SidebarCard>
            )}

            {/* GitHub link */}
            {component.repo_url && (
              <SidebarCard>
                <a
                  href={component.repo_url}
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
              </SidebarCard>
            )}

            {/* Related plugins */}
            {related.length > 0 && (
              <SidebarCard>
                <SidebarLabel>Related</SidebarLabel>
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {related.map((r) => (
                    <li key={r.id} style={{ marginBottom: "6px" }}>
                      <button
                        onClick={() => navigate(`/marketplace/${r.slug}`)}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
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
              </SidebarCard>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ── Small component helpers ───────────────────────────────────

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
        fontSize: "12px",
        color: "var(--fg-subtle)",
      }}
    >
      ← Plugins
    </button>
  );
}

function SidebarCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-base)",
      borderRadius: "8px",
      padding: "10px 12px",
    }}>
      {children}
    </div>
  );
}

function SidebarLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: "10px",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      color: "var(--fg-subtle)",
      margin: "0 0 6px",
    }}>
      {children}
    </p>
  );
}

function GitHubIcon() {
  return (
    <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}
