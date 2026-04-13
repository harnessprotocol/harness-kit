import { lazy, Suspense, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import EditorToolbar from "../../components/file-explorer/EditorToolbar";
import { useFileEditor } from "../../hooks/useFileEditor";
import { getAvatarColor, lookupMcpServer, type McpServerMeta } from "../../lib/mcp-registry";
import {
  type ClaudeMcpConfig,
  type ClaudeMcpServer,
  inferTransport,
  isNetworkServer,
} from "../../lib/mcp-types";

const MonacoEditor = lazy(() => import("../../components/plugin-explorer/MonacoEditor"));

const FILE_PATH = "~/.claude/mcp.json";

// ── Server icon ───────────────────────────────────────────────

function ServerIcon({ meta, name }: { meta: McpServerMeta | null; name: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const bg = meta?.iconBg ?? getAvatarColor(name);
  const letter = (meta?.displayName ?? name).charAt(0).toUpperCase();

  if (meta?.iconSlug && !imgFailed) {
    return (
      <div
        style={{
          width: "36px",
          height: "36px",
          borderRadius: "8px",
          background: bg,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <img
          src={`https://cdn.simpleicons.org/${meta.iconSlug}/ffffff`}
          alt={meta.displayName}
          width={22}
          height={22}
          onError={() => setImgFailed(true)}
          style={{ display: "block" }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        width: "36px",
        height: "36px",
        borderRadius: "8px",
        background: bg,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "15px",
        fontWeight: 700,
        color: "#fff",
        letterSpacing: "-0.5px",
      }}
    >
      {letter}
    </div>
  );
}

// ── Transport badge ───────────────────────────────────────────

function TransportBadge({ transport }: { transport: "stdio" | "sse" | "http" }) {
  const colors: Record<string, { bg: string; text: string }> = {
    stdio: { bg: "var(--bg-elevated)", text: "var(--fg-subtle)" },
    sse: { bg: "#7C3AED22", text: "#A78BFA" },
    http: { bg: "#2563EB22", text: "#60A5FA" },
  };
  const c = colors[transport] ?? colors.stdio;
  return (
    <span
      style={{
        padding: "1px 6px",
        borderRadius: "4px",
        fontSize: "10px",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        background: c.bg,
        color: c.text,
      }}
    >
      {transport}
    </span>
  );
}

// ── Link button ───────────────────────────────────────────────

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "3px",
        fontSize: "11px",
        color: "var(--accent)",
        textDecoration: "none",
        padding: "2px 6px",
        borderRadius: "4px",
        border: "1px solid var(--border-base)",
        background: "var(--bg-elevated)",
        transition: "opacity 0.1s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
    >
      {children}
      <svg width="9" height="9" viewBox="0 0 20 20" fill="currentColor" style={{ opacity: 0.6 }}>
        <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
        <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
      </svg>
    </a>
  );
}

// ── Env var row ───────────────────────────────────────────────

const SECRET_KEY_RE = /key|token|secret|password|auth|credential/i;

function EnvRow({ name, value }: { name: string; value: string }) {
  const isTemplate = /^\$\{.+\}$/.test(value.trim());
  const isLikelySecret =
    !isTemplate &&
    (SECRET_KEY_RE.test(name) || (value.length > 20 && /^[A-Za-z0-9_\-+/=]{20,}$/.test(value)));
  const display = isLikelySecret ? `${value.slice(0, 4)}${"•".repeat(8)}${value.slice(-4)}` : value;

  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "baseline", minWidth: 0 }}>
      <code
        style={{
          fontSize: "11px",
          fontFamily: "ui-monospace, monospace",
          color: "var(--fg-subtle)",
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </code>
      <span style={{ color: "var(--separator)", fontSize: "11px", flexShrink: 0 }}>=</span>
      <code
        style={{
          fontSize: "11px",
          fontFamily: "ui-monospace, monospace",
          color: isTemplate ? "var(--accent)" : "var(--fg-muted)",
          wordBreak: "break-all",
        }}
      >
        {display}
      </code>
    </div>
  );
}

// ── Server card ───────────────────────────────────────────────

function ServerCard({ name, config }: { name: string; config: ClaudeMcpServer }) {
  const meta = lookupMcpServer(name, config);
  const transport = inferTransport(config);
  const isNetwork = isNetworkServer(config);
  const displayName = meta?.displayName ?? name;

  const commandStr = !isNetwork ? [config.command, ...(config.args ?? [])].join(" ") : null;

  const env = !isNetwork && config.env ? Object.entries(config.env) : [];

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-base)",
        borderRadius: "10px",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
        <ServerIcon meta={meta} name={name} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg-base)" }}>
              {displayName}
            </span>
            {meta?.displayName && meta.displayName !== name && (
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--fg-subtle)",
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                {name}
              </span>
            )}
            <TransportBadge transport={transport} />
          </div>

          {meta?.description && (
            <p
              style={{
                margin: "3px 0 0",
                fontSize: "12px",
                color: "var(--fg-muted)",
                lineHeight: "1.4",
              }}
            >
              {meta.description}
            </p>
          )}
        </div>

        {/* External links */}
        <div
          style={{
            display: "flex",
            gap: "4px",
            flexShrink: 0,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          {meta?.homepageUrl && <ExternalLink href={meta.homepageUrl}>Homepage</ExternalLink>}
          {meta?.docsUrl && <ExternalLink href={meta.docsUrl}>Docs</ExternalLink>}
          {meta?.sourceUrl && meta.sourceUrl !== meta.docsUrl && (
            <ExternalLink href={meta.sourceUrl}>Source</ExternalLink>
          )}
        </div>
      </div>

      {/* Command / URL */}
      {commandStr && (
        <div
          style={{
            background: "var(--bg-elevated)",
            borderRadius: "6px",
            padding: "7px 10px",
            fontFamily: "ui-monospace, monospace",
            fontSize: "11px",
            color: "var(--fg-muted)",
            wordBreak: "break-all",
            lineHeight: "1.6",
          }}
        >
          <span style={{ color: "var(--fg-subtle)", marginRight: "6px", userSelect: "none" }}>
            $
          </span>
          {commandStr}
        </div>
      )}
      {isNetwork && (
        <div
          style={{
            background: "var(--bg-elevated)",
            borderRadius: "6px",
            padding: "7px 10px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span
            style={{
              fontSize: "10px",
              fontWeight: 600,
              color: "var(--fg-subtle)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            URL
          </span>
          <code style={{ fontSize: "11px", color: "var(--accent)", wordBreak: "break-all" }}>
            {(config as { url: string }).url}
          </code>
        </div>
      )}

      {/* Environment variables */}
      {env.length > 0 && (
        <div
          style={{
            background: "var(--bg-elevated)",
            borderRadius: "6px",
            padding: "8px 10px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <span
            style={{
              fontSize: "10px",
              fontWeight: 600,
              color: "var(--fg-subtle)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "2px",
            }}
          >
            Environment
          </span>
          {env.map(([k, v]) => (
            <EnvRow key={k} name={k} value={v} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Formatted view ────────────────────────────────────────────

function McpFormattedView({ content }: { content: string }) {
  const { servers, parseError } = useMemo(() => {
    try {
      const parsed: ClaudeMcpConfig = JSON.parse(content);
      return { servers: parsed.mcpServers ?? {}, parseError: null };
    } catch (e) {
      return { servers: {}, parseError: String(e) };
    }
  }, [content]);

  if (parseError) {
    return (
      <div style={{ padding: "20px 24px" }}>
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-base)",
            borderRadius: "8px",
            padding: "12px 16px",
            color: "var(--danger)",
            fontSize: "12px",
          }}
        >
          {parseError}
        </div>
      </div>
    );
  }

  const entries = Object.entries(servers);

  if (entries.length === 0) {
    return (
      <div style={{ padding: "32px 24px", textAlign: "center" }}>
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-base)",
            borderRadius: "10px",
            padding: "32px 24px",
            maxWidth: "480px",
            margin: "0 auto",
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            style={{ color: "var(--fg-subtle)", margin: "0 auto 12px", display: "block" }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z"
            />
          </svg>
          <p
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--fg-base)",
              margin: "0 0 6px",
            }}
          >
            No MCP servers configured
          </p>
          <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: 0, lineHeight: "1.5" }}>
            Add servers to{" "}
            <code style={{ fontFamily: "ui-monospace, monospace" }}>~/.claude/mcp.json</code> under
            the <code style={{ fontFamily: "ui-monospace, monospace" }}>mcpServers</code> key.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ fontSize: "11px", color: "var(--fg-subtle)", marginBottom: "2px" }}>
        {entries.length} server{entries.length !== 1 ? "s" : ""} configured
      </div>
      {entries.map(([name, config]) => (
        <ServerCard key={name} name={name} config={config} />
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function McpServersPage() {
  const navigate = useNavigate();
  const editor = useFileEditor(FILE_PATH);
  const [viewMode, setViewMode] = useState<"formatted" | "editor">("formatted");

  const toolbarActions = (
    <button
      onClick={() => navigate(`/harness/config/${encodeURIComponent("mcp.json")}`)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "3px 8px",
        borderRadius: "5px",
        border: "1px solid var(--border-base)",
        background: "var(--bg-elevated)",
        color: "var(--fg-subtle)",
        fontSize: "11px",
        cursor: "pointer",
        whiteSpace: "nowrap",
        fontFamily: "inherit",
      }}
      title="Open mcp.json in the editor"
    >
      <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
          clipRule="evenodd"
        />
      </svg>
      mcp.json
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <EditorToolbar
        filePath="MCP Servers"
        subtitle="~/.claude/mcp.json"
        isDirty={editor.isDirty}
        saving={editor.saving}
        viewMode={viewMode}
        availableModes={[
          { key: "formatted", label: "Formatted" },
          { key: "editor", label: "Editor" },
        ]}
        onViewModeChange={(m) => setViewMode(m as "formatted" | "editor")}
        onSave={viewMode === "editor" ? editor.saveFile : undefined}
        actions={toolbarActions}
      />

      {viewMode === "formatted" && (
        <div style={{ flex: 1, overflow: "auto" }}>
          {editor.loading && (
            <div
              style={{
                padding: "20px 24px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    height: "100px",
                    borderRadius: "10px",
                    background: "var(--bg-elevated)",
                    animation: "shimmer 1.5s ease-in-out infinite",
                    animationDelay: `${i * 0.1}s`,
                    opacity: 0.5,
                  }}
                />
              ))}
            </div>
          )}
          {editor.error && (
            <div style={{ padding: "20px 24px" }}>
              <div
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-base)",
                  borderRadius: "8px",
                  padding: "12px 16px",
                  color: "var(--danger)",
                  fontSize: "12px",
                }}
              >
                {editor.error}
              </div>
            </div>
          )}
          {!editor.loading && !editor.error && editor.content !== null && (
            <McpFormattedView content={editor.content} />
          )}
        </div>
      )}

      {viewMode === "editor" && !editor.loading && editor.content !== null && (
        <div style={{ flex: 1, minHeight: 0 }}>
          <Suspense fallback={null}>
            <MonacoEditor
              filePath={FILE_PATH}
              content={editor.content}
              onChange={editor.updateContent}
              onSave={editor.saveFile}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}
