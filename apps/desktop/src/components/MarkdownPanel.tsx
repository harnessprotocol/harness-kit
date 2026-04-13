import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getMarkdownFont } from "../lib/preferences";

interface MarkdownPanelProps {
  content: string;
  title?: string;
  defaultView?: "preview" | "raw";
  /** Fill all available height instead of intrinsic height */
  fill?: boolean;
}

export default function MarkdownPanel({
  content,
  title,
  defaultView = "preview",
  fill = false,
}: MarkdownPanelProps) {
  const [view, setView] = useState<"preview" | "raw">(defaultView);
  const [mdFont, setMdFont] = useState(getMarkdownFont);

  useEffect(() => {
    function onPrefsChanged() {
      setMdFont(getMarkdownFont());
    }
    window.addEventListener("harness-kit-prefs-changed", onPrefsChanged);
    return () => window.removeEventListener("harness-kit-prefs-changed", onPrefsChanged);
  }, []);

  const tabBtn = (active: boolean): React.CSSProperties => ({
    fontSize: "10px",
    fontWeight: active ? 600 : 400,
    padding: "3px 8px",
    borderRadius: "4px",
    border: "none",
    background: active ? "var(--bg-elevated)" : "transparent",
    color: active ? "var(--fg-base)" : "var(--fg-subtle)",
    cursor: "pointer",
    boxShadow: active ? "var(--shadow-sm)" : "none",
    transition: "all 0.1s",
  });

  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        flex: fill ? 1 : undefined,
        marginBottom: fill ? 0 : "24px",
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: title ? "space-between" : "flex-end",
          marginBottom: "8px",
          flexShrink: 0,
        }}
      >
        {title && (
          <p
            style={{
              fontSize: "10px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--fg-subtle)",
              margin: 0,
            }}
          >
            {title}
          </p>
        )}
        <div
          style={{
            display: "flex",
            gap: "2px",
            background: "var(--bg-base)",
            border: "1px solid var(--border-base)",
            borderRadius: "6px",
            padding: "2px",
          }}
        >
          <button onClick={() => setView("preview")} style={tabBtn(view === "preview")}>
            Preview
          </button>
          <button onClick={() => setView("raw")} style={tabBtn(view === "raw")}>
            Raw
          </button>
        </div>
      </div>

      <div
        style={{
          flex: fill ? 1 : undefined,
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "8px",
          padding: "14px 16px",
          overflow: fill ? "auto" : undefined,
          overflowX: "auto",
          minHeight: 0,
        }}
      >
        {view === "preview" ? (
          <div
            className="markdown-body"
            style={
              mdFont === "mono"
                ? {
                    fontFamily:
                      "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
                  }
                : undefined
            }
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        ) : (
          <pre
            style={{
              margin: 0,
              fontFamily: "ui-monospace, monospace",
              fontSize: "11px",
              lineHeight: "1.6",
              color: "var(--fg-muted)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {content}
          </pre>
        )}
      </div>
    </section>
  );
}
