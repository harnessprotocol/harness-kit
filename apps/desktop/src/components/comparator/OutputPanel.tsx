import { useEffect, useRef, useMemo } from "react";
import DOMPurify from "dompurify";
import Convert from "ansi-to-html";
import type { PanelState } from "../../hooks/useComparison";
import PanelStatusBar from "./PanelStatusBar";

const ansiConverter = new Convert({ newline: true, escapeXML: true });

interface OutputPanelProps {
  panel: PanelState;
  onKill: (panelId: string) => void;
}

export default function OutputPanel({ panel, onKill }: OutputPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new output
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [panel.outputLines.length]);

  // Convert ANSI → HTML, then sanitize with DOMPurify to prevent XSS
  const sanitizedHtml = useMemo(() => {
    const raw = panel.outputLines.join("");
    const html = ansiConverter.toHtml(raw);
    return DOMPurify.sanitize(html);
  }, [panel.outputLines]);

  return (
    <div className="comparator-panel">
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid var(--separator)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--fg-base)" }}>
            {panel.harnessName}
          </span>
          {panel.model && (
            <span
              style={{
                fontSize: "10px",
                padding: "1px 6px",
                borderRadius: "4px",
                background: "var(--accent-light)",
                color: "var(--accent-text)",
              }}
            >
              {panel.model}
            </span>
          )}
        </div>

        {panel.status === "running" && (
          <button
            onClick={() => onKill(panel.panelId)}
            style={{
              fontSize: "11px",
              padding: "3px 10px",
              borderRadius: "5px",
              border: "1px solid var(--danger)",
              background: "transparent",
              color: "var(--danger)",
              cursor: "pointer",
            }}
          >
            Stop
          </button>
        )}
      </div>

      {/* Output body — HTML is sanitized via DOMPurify above */}
      <div ref={scrollRef} className="comparator-output">
        <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
      </div>

      {/* Status bar */}
      <PanelStatusBar panel={panel} />
    </div>
  );
}
