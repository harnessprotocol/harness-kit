import { lazy, Suspense, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import EditorToolbar from "../../components/file-explorer/EditorToolbar";
import { useFileEditor } from "../../hooks/useFileEditor";

const MonacoEditor = lazy(() => import("../../components/plugin-explorer/MonacoEditor"));

const FILE_PATH = "~/.claude/settings.json";

// ── Hook event metadata ───────────────────────────────────────

interface HookEventMeta {
  label: string;
  description: string;
  icon: React.ReactNode;
  order: number;
}

const HOOK_ICON_STYLE: React.CSSProperties = {
  color: "var(--fg-subtle)",
  flexShrink: 0,
};

const EVENT_META: Record<string, HookEventMeta> = {
  SessionStart: {
    label: "Session Start",
    description: "Runs once when a new Claude Code session is created.",
    order: 0,
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        style={HOOK_ICON_STYLE}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5.636 5.636a9 9 0 1012.728 0M12 3v9"
        />
      </svg>
    ),
  },
  UserPromptSubmit: {
    label: "User Prompt Submit",
    description:
      "Fires each time the user submits a message. Can inject context or block requests.",
    order: 1,
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        style={HOOK_ICON_STYLE}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
        />
      </svg>
    ),
  },
  PreToolUse: {
    label: "Pre Tool Use",
    description: "Runs before every tool call. Can inspect, modify, or block the operation.",
    order: 2,
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        style={HOOK_ICON_STYLE}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
        />
      </svg>
    ),
  },
  PostToolUse: {
    label: "Post Tool Use",
    description:
      "Runs after every tool call completes. Can observe results or trigger side effects.",
    order: 3,
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        style={HOOK_ICON_STYLE}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 5.25v13.5" />
      </svg>
    ),
  },
  Notification: {
    label: "Notification",
    description:
      "Fires when Claude sends a notification — permission prompts, idle alerts, dialogs.",
    order: 4,
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        style={HOOK_ICON_STYLE}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
        />
      </svg>
    ),
  },
  Stop: {
    label: "Stop",
    description: "Runs when Claude finishes a response successfully.",
    order: 5,
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        style={HOOK_ICON_STYLE}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z"
        />
      </svg>
    ),
  },
  StopFailure: {
    label: "Stop Failure",
    description: "Fires on rate limits, auth failures, billing errors, or server errors.",
    order: 6,
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        style={HOOK_ICON_STYLE}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
        />
      </svg>
    ),
  },
  PreCompact: {
    label: "Pre Compact",
    description: "Runs before context compaction. Use to capture state before the window shrinks.",
    order: 7,
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        style={HOOK_ICON_STYLE}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"
        />
      </svg>
    ),
  },
  SessionEnd: {
    label: "Session End",
    description: "Fires when a Claude Code session terminates. Good for cleanup or capture.",
    order: 8,
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        style={HOOK_ICON_STYLE}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5.636 5.636a9 9 0 1012.728 0M12 3v9"
          transform="rotate(180 12 12)"
        />
      </svg>
    ),
  },
};

// ── Hook entry ────────────────────────────────────────────────

interface HookEntry {
  type: string;
  command?: string;
  timeout?: number;
}

interface HookMatcher {
  matcher?: string;
  hooks: HookEntry[];
}

function MatcherBadge({ matcher }: { matcher?: string }) {
  if (!matcher || matcher === "*") {
    return (
      <span
        style={{
          padding: "1px 6px",
          borderRadius: "4px",
          fontSize: "10px",
          fontWeight: 600,
          background: "var(--bg-elevated)",
          color: "var(--fg-subtle)",
          fontFamily: "ui-monospace, monospace",
        }}
      >
        all tools
      </span>
    );
  }
  return (
    <span
      style={{
        padding: "1px 6px",
        borderRadius: "4px",
        fontSize: "10px",
        fontWeight: 600,
        background: "var(--accent-light, #1a1a2e)",
        color: "var(--accent)",
        fontFamily: "ui-monospace, monospace",
        wordBreak: "break-all",
      }}
    >
      {matcher}
    </span>
  );
}

function HookRow({ entry }: { entry: HookEntry }) {
  const cmd = entry.command ?? "";
  // Show basename for long absolute paths, keep the full path accessible via title
  const display = cmd.startsWith("/") ? (cmd.split("/").pop() ?? cmd) : cmd;
  const isScript = cmd.endsWith(".sh") || cmd.endsWith(".py") || cmd.endsWith(".js");

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "5px 10px",
        background: "var(--bg-elevated)",
        borderRadius: "6px",
      }}
    >
      {/* Type indicator */}
      {entry.type === "command" && (
        <svg
          width="11"
          height="11"
          viewBox="0 0 20 20"
          fill="currentColor"
          style={{ color: "var(--fg-subtle)", flexShrink: 0 }}
        >
          <path
            fillRule="evenodd"
            d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.293 7.707a1 1 0 010-1.414zM11 12a1 1 0 100 2h3a1 1 0 100-2h-3z"
            clipRule="evenodd"
          />
        </svg>
      )}
      <code
        title={cmd}
        style={{
          fontSize: "11px",
          fontFamily: "ui-monospace, monospace",
          color: isScript ? "var(--accent)" : "var(--fg-muted)",
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {display}
      </code>
      {cmd !== display && (
        <span
          style={{
            fontSize: "10px",
            color: "var(--fg-subtle)",
            fontFamily: "ui-monospace, monospace",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "160px",
            flexShrink: 1,
          }}
        >
          {cmd.replace(display, "").replace(/\/$/, "")}
        </span>
      )}
      {entry.timeout != null && (
        <span
          style={{
            fontSize: "10px",
            color: "var(--fg-subtle)",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {entry.timeout}s
        </span>
      )}
    </div>
  );
}

function HookMatcherBlock({ matcher }: { matcher: HookMatcher }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <div style={{ marginBottom: "2px" }}>
        <MatcherBadge matcher={matcher.matcher} />
      </div>
      {matcher.hooks.map((entry, i) => (
        <HookRow key={i} entry={entry} />
      ))}
    </div>
  );
}

function HookEventSection({ event, matchers }: { event: string; matchers: HookMatcher[] }) {
  const meta = EVENT_META[event];
  const totalHooks = matchers.reduce((n, m) => n + m.hooks.length, 0);

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
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "7px",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-base)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {meta?.icon ?? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 20 20"
              fill="currentColor"
              style={{ color: "var(--fg-subtle)" }}
            >
              <path
                fillRule="evenodd"
                d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg-base)" }}>
              {meta?.label ?? event}
            </span>
            <span
              style={{
                padding: "1px 6px",
                borderRadius: "4px",
                fontSize: "10px",
                fontWeight: 600,
                background: "var(--bg-elevated)",
                color: "var(--fg-subtle)",
              }}
            >
              {totalHooks} {totalHooks === 1 ? "hook" : "hooks"}
            </span>
          </div>
          {meta?.description && (
            <p
              style={{
                margin: "2px 0 0",
                fontSize: "12px",
                color: "var(--fg-muted)",
                lineHeight: "1.4",
              }}
            >
              {meta.description}
            </p>
          )}
        </div>
      </div>

      {/* Matchers */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {matchers.map((m, i) => (
          <HookMatcherBlock key={i} matcher={m} />
        ))}
      </div>
    </div>
  );
}

// ── Formatted view ────────────────────────────────────────────

function HooksFormattedView({ content }: { content: string }) {
  const { hooks, parseError } = useMemo(() => {
    try {
      const parsed = JSON.parse(content);
      const raw = parsed?.hooks ?? {};
      return { hooks: raw as Record<string, HookMatcher[]>, parseError: null };
    } catch (e) {
      return { hooks: {}, parseError: String(e) };
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

  // Sort events by lifecycle order
  const entries = Object.entries(hooks).sort(([a], [b]) => {
    const ao = EVENT_META[a]?.order ?? 99;
    const bo = EVENT_META[b]?.order ?? 99;
    return ao - bo;
  });

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
              d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z"
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
            No hooks configured
          </p>
          <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: 0, lineHeight: "1.5" }}>
            Add a <code style={{ fontFamily: "ui-monospace, monospace" }}>hooks</code> key to{" "}
            <code style={{ fontFamily: "ui-monospace, monospace" }}>~/.claude/settings.json</code>{" "}
            to run scripts at key points in Claude's lifecycle.
          </p>
        </div>
      </div>
    );
  }

  const totalHooks = entries.reduce(
    (n, [, matchers]) => n + matchers.reduce((m, matcher) => m + matcher.hooks.length, 0),
    0,
  );

  return (
    <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ fontSize: "11px", color: "var(--fg-subtle)", marginBottom: "2px" }}>
        {totalHooks} {totalHooks === 1 ? "hook" : "hooks"} across {entries.length}{" "}
        {entries.length === 1 ? "event" : "events"}
      </div>
      {entries.map(([event, matchers]) => (
        <HookEventSection key={event} event={event} matchers={matchers} />
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function HooksPage() {
  const navigate = useNavigate();
  const editor = useFileEditor(FILE_PATH);
  const [viewMode, setViewMode] = useState<"formatted" | "editor">("formatted");

  const toolbarActions = (
    <button
      onClick={() => navigate(`/harness/config/${encodeURIComponent("settings.json")}`)}
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
      title="Open settings.json in the editor"
    >
      <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
          clipRule="evenodd"
        />
      </svg>
      settings.json
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <EditorToolbar
        filePath="Hooks"
        subtitle="~/.claude/settings.json"
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
                    height: "90px",
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
            <HooksFormattedView content={editor.content} />
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
