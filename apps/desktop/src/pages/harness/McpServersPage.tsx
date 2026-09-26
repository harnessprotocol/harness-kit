import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { PlugZap, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Card, EmptyState, Modal } from "@harness-kit/ui";
import EditorToolbar from "../../components/file-explorer/EditorToolbar";
import McpServerForm from "../../components/mcp/McpServerForm";
import { type ClaudeMcpServer, isNetworkServer, inferTransport } from "../../lib/mcp-types";
import { lookupMcpServer, getAvatarColor, type McpServerMeta } from "../../lib/mcp-registry";
import {
  locateClaudeMcpStore,
  readMcpStore,
  writeMcpServers,
  McpStoreError,
  type McpStoreLocation,
  type McpStoreSnapshot,
} from "../../lib/mcp-store";

const MonacoEditor = lazy(() => import("../../components/plugin-explorer/MonacoEditor"));

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

/** Keys the form owns. Anything else on an entry (oauth, timeouts, fields a
 *  newer Claude Code adds) is carried over untouched when the form saves. */
const FORM_KEYS = ["type", "command", "args", "env", "url", "headers"];


// ── Server icon ───────────────────────────────────────────────

function ServerIcon({ meta, name }: { meta: McpServerMeta | null; name: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const bg = meta?.iconBg ?? getAvatarColor(name);
  const letter = (meta?.displayName ?? name).charAt(0).toUpperCase();

  if (meta?.iconSlug && !imgFailed) {
    return (
      <div style={{
        width: "36px", height: "36px", borderRadius: "8px",
        background: bg, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden",
      }}>
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
    <div style={{
      width: "36px", height: "36px", borderRadius: "8px",
      background: bg, flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: "15px", fontWeight: 700, color: "#fff",
      letterSpacing: "-0.5px",
    }}>
      {letter}
    </div>
  );
}

// ── Transport badge ───────────────────────────────────────────

function TransportBadge({ transport }: { transport: "stdio" | "sse" | "http" }) {
  const colors: Record<string, { bg: string; text: string }> = {
    stdio: { bg: "var(--bg-elevated)", text: "var(--fg-subtle)" },
    sse:   { bg: "var(--accent-light)", text: "var(--accent-text)" },
    http:  { bg: "var(--accent-light)", text: "var(--accent-text)" },
  };
  const c = colors[transport] ?? colors.stdio;
  return (
    <span style={{
      padding: "1px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 600,
      textTransform: "uppercase", letterSpacing: "0.04em",
      background: c.bg, color: c.text,
    }}>
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
        display: "inline-flex", alignItems: "center", gap: "3px",
        fontSize: "11px", color: "var(--accent)", textDecoration: "none",
        padding: "2px 6px", borderRadius: "4px",
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
  const isLikelySecret = !isTemplate && (
    SECRET_KEY_RE.test(name) ||
    (value.length > 20 && /^[A-Za-z0-9_\-+/=]{20,}$/.test(value))
  );
  const display = isLikelySecret ? `${value.slice(0, 4)}${"•".repeat(8)}${value.slice(-4)}` : value;

  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "baseline", minWidth: 0 }}>
      <code style={{
        fontSize: "11px", fontFamily: "ui-monospace, monospace",
        color: "var(--fg-subtle)", flexShrink: 0, whiteSpace: "nowrap",
      }}>
        {name}
      </code>
      <span style={{ color: "var(--separator)", fontSize: "11px", flexShrink: 0 }}>=</span>
      <code style={{
        fontSize: "11px", fontFamily: "ui-monospace, monospace",
        color: isTemplate ? "var(--accent)" : "var(--fg-muted)",
        wordBreak: "break-all",
      }}>
        {display}
      </code>
    </div>
  );
}

// ── Server card ───────────────────────────────────────────────

function ServerCard({
  name,
  config,
  onEdit,
  onDelete,
}: {
  name: string;
  config: ClaudeMcpServer;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const meta = lookupMcpServer(name, config);
  const transport = inferTransport(config);
  const isNetwork = isNetworkServer(config);
  const displayName = meta?.displayName ?? name;

  const commandStr = !isNetwork
    ? [config.command, ...(config.args ?? [])].join(" ")
    : null;

  const env = !isNetwork && config.env ? Object.entries(config.env) : [];

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
        <ServerIcon meta={meta} name={name} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg-base)" }}>
              {displayName}
            </span>
            {meta?.displayName && meta.displayName !== name && (
              <span style={{ fontSize: "11px", color: "var(--fg-subtle)", fontFamily: "ui-monospace, monospace" }}>
                {name}
              </span>
            )}
            <TransportBadge transport={transport} />
          </div>

          {meta?.description && (
            <p style={{ margin: "3px 0 0", fontSize: "12px", color: "var(--fg-muted)", lineHeight: "1.4" }}>
              {meta.description}
            </p>
          )}
        </div>

        {/* External links */}
        <div style={{ display: "flex", gap: "4px", flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {meta?.homepageUrl && <ExternalLink href={meta.homepageUrl}>Homepage</ExternalLink>}
          {meta?.docsUrl && <ExternalLink href={meta.docsUrl}>Docs</ExternalLink>}
          {meta?.sourceUrl && meta.sourceUrl !== meta.docsUrl && (
            <ExternalLink href={meta.sourceUrl}>Source</ExternalLink>
          )}
          <Button size="sm" onClick={onEdit} aria-label={`Edit ${name}`} title="Edit">
            <Pencil size={13} strokeWidth={1.7} aria-hidden="true" />
          </Button>
          <Button size="sm" onClick={onDelete} aria-label={`Delete ${name}`} title="Delete">
            <Trash2 size={13} strokeWidth={1.7} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Command / URL */}
      {commandStr && (
        <div style={{
          background: "var(--bg-elevated)",
          borderRadius: "6px",
          padding: "7px 10px",
          fontFamily: "ui-monospace, monospace",
          fontSize: "11px",
          color: "var(--fg-muted)",
          wordBreak: "break-all",
          lineHeight: "1.6",
        }}>
          <span style={{ color: "var(--fg-subtle)", marginRight: "6px", userSelect: "none" }}>$</span>
          {commandStr}
        </div>
      )}
      {isNetwork && (
        <div style={{
          background: "var(--bg-elevated)",
          borderRadius: "6px",
          padding: "7px 10px",
          display: "flex", alignItems: "center", gap: "8px",
        }}>
          <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.05em" }}>URL</span>
          <code style={{ fontSize: "11px", color: "var(--accent)", wordBreak: "break-all" }}>
            {(config as { url: string }).url}
          </code>
        </div>
      )}

      {/* Environment variables */}
      {env.length > 0 && (
        <div style={{
          background: "var(--bg-elevated)",
          borderRadius: "6px",
          padding: "8px 10px",
          display: "flex", flexDirection: "column", gap: "4px",
        }}>
          <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>
            Environment
          </span>
          {env.map(([k, v]) => <EnvRow key={k} name={k} value={v} />)}
        </div>
      )}
    </Card>
  );
}


// ── Error notice (AC-20) ──────────────────────────────────────

function toStoreError(error: unknown, fallback: string): McpStoreError {
  if (error instanceof McpStoreError) return error;
  return new McpStoreError(fallback, "write", error instanceof Error ? error.message : String(error));
}

/** What failed, one action, and the raw error behind a Details disclosure. */
function ErrorNotice({
  error,
  actionLabel,
  onAction,
}: {
  error: McpStoreError;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <Card padding="sm" role="alert" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ flex: 1, fontSize: 12, color: "var(--danger)" }}>{error.summary}</span>
        <Button size="sm" onClick={onAction}>{actionLabel}</Button>
      </div>
      {error.detail && (
        <details style={{ fontSize: 11, color: "var(--fg-subtle)" }}>
          <summary style={{ cursor: "pointer" }}>Details</summary>
          <code style={{ fontFamily: MONO, wordBreak: "break-all" }}>{error.detail}</code>
        </details>
      )}
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────

type FormState = { mode: "add" } | { mode: "edit"; name: string };
type LoadState =
  | { status: "loading" }
  | { status: "error"; error: McpStoreError }
  | { status: "ready"; snapshot: McpStoreSnapshot };

export default function McpServersPage() {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [location, setLocation] = useState<McpStoreLocation | null>(null);
  const [viewMode, setViewMode] = useState<"servers" | "json">("servers");
  const [form, setForm] = useState<FormState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [mutationError, setMutationError] = useState<McpStoreError | null>(null);
  const [rawDraft, setRawDraft] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoad({ status: "loading" });
    try {
      const where = await locateClaudeMcpStore();
      setLocation(where);
      const snapshot = await readMcpStore(where);
      setLoad({ status: "ready", snapshot });
      setRawDraft(null);
    } catch (error) {
      setLoad({ status: "error", error: toStoreError(error, "Couldn't load Claude Code's MCP servers.") });
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const snapshot = load.status === "ready" ? load.snapshot : null;
  const entries = useMemo(
    () => (snapshot ? Object.entries(snapshot.servers).sort(([a], [b]) => a.localeCompare(b)) : []),
    [snapshot],
  );
  const rawOriginal = useMemo(
    () => (snapshot ? JSON.stringify(snapshot.servers, null, 2) : ""),
    [snapshot],
  );

  /** Every write: fresh read, merge onto the current file, then reload. */
  async function commit(update: (current: Record<string, unknown>) => Record<string, unknown>): Promise<boolean> {
    if (!snapshot) return false;
    setSaving(true);
    setMutationError(null);
    try {
      await writeMcpServers(snapshot.location, snapshot.servers, update);
      await reload();
      return true;
    } catch (error) {
      setMutationError(toStoreError(error, `Couldn't save ${snapshot.location.displayPath}.`));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleFormSave(name: string, server: ClaudeMcpServer) {
    const editing = form?.mode === "edit" ? form.name : null;
    const ok = await commit((current) => {
      const previous = editing ? current[editing] : undefined;
      const kept: Record<string, unknown> = {};
      if (previous && typeof previous === "object") {
        for (const [key, value] of Object.entries(previous)) if (!FORM_KEYS.includes(key)) kept[key] = value;
      }
      return { ...current, [name]: { ...kept, ...server } };
    });
    if (ok) setForm(null);
  }

  async function handleDelete() {
    const name = pendingDelete;
    if (!name) return;
    const ok = await commit((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
    if (ok) setPendingDelete(null);
  }

  async function handleRawSave() {
    if (rawDraft === null || !snapshot) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawDraft);
    } catch (error) {
      setMutationError(new McpStoreError(
        "That JSON doesn't parse, so nothing was saved.",
        "invalid",
        error instanceof Error ? error.message : String(error),
      ));
      return;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)
      || Object.values(parsed).some((v) => typeof v !== "object" || v === null || Array.isArray(v))) {
      setMutationError(new McpStoreError(
        "The servers must be a JSON object of name → server settings, so nothing was saved.",
        "invalid",
      ));
      return;
    }
    await commit(() => parsed as Record<string, unknown>);
  }

  function openForm(next: FormState) {
    setMutationError(null);
    setForm(next);
  }

  const displayPath = location?.displayPath ?? "…";
  const editingServer = form?.mode === "edit" && snapshot
    ? (snapshot.servers[form.name] as unknown as ClaudeMcpServer | undefined)
    : undefined;
  const addButton = (
    <Button variant="primary" size="sm" onClick={() => openForm({ mode: "add" })}>
      <Plus size={13} strokeWidth={1.7} aria-hidden="true" style={{ marginRight: 4 }} />
      Add server
    </Button>
  );
  const rawDirty = rawDraft !== null && rawDraft !== rawOriginal;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <EditorToolbar
        filePath="MCP servers"
        subtitle="Claude Code · user scope"
        isDirty={viewMode === "json" && rawDirty}
        saving={saving}
        viewMode={viewMode}
        availableModes={[
          { key: "servers", label: "Servers" },
          { key: "json", label: "Raw JSON" },
        ]}
        onViewModeChange={(m) => { setMutationError(null); setViewMode(m as "servers" | "json"); }}
        onSave={viewMode === "json" ? () => void handleRawSave() : undefined}
        actions={snapshot && entries.length > 0 && viewMode === "servers" ? addButton : undefined}
      />

      <div style={{ padding: "8px 24px 0", fontSize: 11, color: "var(--fg-subtle)" }}>
        Reading{" "}
        <code data-testid="mcp-store-path" style={{ fontFamily: MONO, color: "var(--fg-muted)" }}>
          {displayPath}
        </code>
        {viewMode === "json" && " · the mcpServers key only; the rest of the file is left as it is"}
      </div>

      {load.status === "loading" && (
        <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 10 }} aria-busy="true">
          {[1, 2, 3].map((i) => (
            <div key={i} style={{
              height: 100, borderRadius: 10, background: "var(--bg-elevated)",
              animation: "shimmer 1.5s ease-in-out infinite", animationDelay: `${i * 0.1}s`, opacity: 0.5,
            }} />
          ))}
        </div>
      )}

      {load.status === "error" && (
        <div style={{ padding: "16px 24px" }}>
          <ErrorNotice error={load.error} actionLabel="Try again" onAction={() => void reload()} />
        </div>
      )}

      {snapshot && viewMode === "servers" && (
        <div style={{ flex: 1, overflow: "auto" }}>
          {mutationError && !form && !pendingDelete && (
            <div style={{ padding: "16px 24px 0" }}>
              <ErrorNotice error={mutationError} actionLabel="Reload" onAction={() => void reload()} />
            </div>
          )}
          {entries.length === 0 ? (
            <div style={{ padding: "32px 24px" }}>
              <EmptyState
                icon={<PlugZap size={28} strokeWidth={1.5} />}
                title="No MCP servers yet"
                description={
                  "An MCP server gives Claude Code extra tools, like reading a database or searching the web. " +
                  (snapshot.found
                    ? `None are set up in ${snapshot.location.displayPath}.`
                    : `${snapshot.location.displayPath} doesn't exist yet; adding a server creates it.`)
                }
                action={addButton}
              />
            </div>
          ) : (
            <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>
                {entries.length} server{entries.length !== 1 ? "s" : ""} configured
              </div>
              {entries.map(([name, config]) => (
                <ServerCard
                  key={name}
                  name={name}
                  config={config as unknown as ClaudeMcpServer}
                  onEdit={() => openForm({ mode: "edit", name })}
                  onDelete={() => { setMutationError(null); setPendingDelete(name); }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {snapshot && viewMode === "json" && (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {mutationError && (
            <div style={{ padding: "8px 24px" }}>
              <ErrorNotice error={mutationError} actionLabel="Reload" onAction={() => void reload()} />
            </div>
          )}
          <div style={{ flex: 1, minHeight: 0 }}>
            <Suspense fallback={null}>
              <MonacoEditor
                filePath="mcpServers.json"
                content={rawDraft ?? rawOriginal}
                onChange={setRawDraft}
                onSave={() => void handleRawSave()}
              />
            </Suspense>
          </div>
        </div>
      )}

      <McpServerForm
        open={form !== null}
        mode={form?.mode ?? "add"}
        initialName={form?.mode === "edit" ? form.name : undefined}
        initialServer={editingServer}
        existingNames={entries.map(([name]) => name)}
        saving={saving}
        error={mutationError && form ? (
          <ErrorNotice error={mutationError} actionLabel="Reload" onAction={() => { setForm(null); void reload(); }} />
        ) : undefined}
        onSave={(name, server) => void handleFormSave(name, server)}
        onCancel={() => { setForm(null); setMutationError(null); }}
      />

      <Modal
        open={pendingDelete !== null}
        onClose={() => { setPendingDelete(null); setMutationError(null); }}
        title={`Delete ${pendingDelete ?? ""}?`}
        footer={
          <>
            <Button size="sm" onClick={() => { setPendingDelete(null); setMutationError(null); }}>Cancel</Button>
            <Button size="sm" variant="danger" onClick={() => void handleDelete()} disabled={saving}>
              {saving ? "Deleting…" : "Delete server"}
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12, color: "var(--fg-muted)" }}>
          <span>
            Claude Code stops loading this server. It is removed from{" "}
            <code style={{ fontFamily: MONO }}>{displayPath}</code>; nothing else in the file changes.
          </span>
          {mutationError && pendingDelete && (
            <ErrorNotice error={mutationError} actionLabel="Reload" onAction={() => { setPendingDelete(null); void reload(); }} />
          )}
        </div>
      </Modal>
    </div>
  );
}
