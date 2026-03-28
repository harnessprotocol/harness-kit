import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { PanelState } from "../../hooks/useComparison";
import PanelStatusBar from "./PanelStatusBar";

interface TerminalPaneProps {
  panel: PanelState;
  onKill: (panelId: string) => void;
}

export default function TerminalPane({ panel, onKill }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const writtenRef = useRef(0);

  // Initialize terminal once on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const fitAddon = new FitAddon();

    const terminal = new Terminal({
      fontSize: 12,
      fontFamily:
        "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
      theme: {
        background: "#0d0d1a",
        foreground: "#d0d0dc",
        cursor: "#d0d0dc",
        selectionBackground: "#3a3a5c",
      },
      scrollback: 10000,
      convertEol: true,
      linkHandler: null,
    });

    terminal.loadAddon(fitAddon);
    terminal.open(container);
    fitAddon.fit();

    termRef.current = terminal;
    writtenRef.current = 0;

    const observer = new ResizeObserver(() => {
      fitAddon.fit();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      terminal.dispose();
      termRef.current = null;
      writtenRef.current = 0;
    };
  }, []);

  // Incremental writes: only write NEW chunks
  useEffect(() => {
    const terminal = termRef.current;
    if (!terminal) return;

    const start = writtenRef.current;
    for (let i = start; i < panel.outputLines.length; i++) {
      terminal.write(panel.outputLines[i]);
    }
    writtenRef.current = panel.outputLines.length;
  }, [panel.outputLines.length]); // only rerun when length changes, not on reference changes

  return (
    <div className="comparator-panel" style={{ display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid var(--separator)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--fg-base)" }}>
            {panel.harnessName}
          </span>
          {panel.model && <span className="badge badge-accent">{panel.model}</span>}
        </div>

        {panel.status === "running" && (
          <button className="btn btn-sm btn-danger" onClick={() => onKill(panel.panelId)}>
            Stop
          </button>
        )}
      </div>

      {/* xterm.js terminal */}
      <div
        ref={containerRef}
        style={{ flex: 1, minHeight: 0, overflow: "hidden" }}
      />

      {/* Status bar */}
      <PanelStatusBar panel={panel} />
    </div>
  );
}
