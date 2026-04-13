import { invoke } from "@tauri-apps/api/core";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";

// ── Types ────────────────────────────────────────────────────

export interface TerminalViewProps {
  terminalId: string;
  rawChunks: string[];
}

// ── Component ────────────────────────────────────────────────

export default function TerminalView({ terminalId, rawChunks }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const writtenRef = useRef(0);

  // ── Mount xterm ──────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 12,
      scrollback: 10000,
      convertEol: true,
      cursorBlink: true,
      theme: {
        background: "#0d0d1a",
        foreground: "#d0d0dc",
        cursor: "#d0d0dc",
        selectionBackground: "#3a3a5c",
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);

    // Initial fit + focus — double rAF ensures xterm DOM is fully laid out.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fit.fit();
        term.focus();
        if (terminalId) {
          invoke("resize_terminal", {
            terminalId,
            rows: term.rows,
            cols: term.cols,
          }).catch(console.error);
        }
      });
    });

    // Bidirectional I/O: keystrokes -> pty.
    term.onData((data) => {
      if (terminalId) {
        invoke("write_terminal", { terminalId, data }).catch(console.error);
      }
    });

    termRef.current = term;
    fitRef.current = fit;
    writtenRef.current = 0;

    // ── Resize observer ────────────────────────────────────────

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        fit.fit();
        if (terminalId) {
          invoke("resize_terminal", {
            terminalId,
            rows: term.rows,
            cols: term.cols,
          }).catch(console.error);
        }
      });
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      writtenRef.current = 0;
    };
  }, [terminalId]);

  // ── Write new chunks to xterm ────────────────────────────────

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const start = writtenRef.current;
    if (start < rawChunks.length) {
      for (let i = start; i < rawChunks.length; i++) {
        term.write(rawChunks[i]);
      }
      writtenRef.current = rawChunks.length;
    }
    // rawChunks is the same array reference (mutated); rawChunks.length changes
    // on each parent re-render triggered by outputTick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawChunks.length]);

  // ── Render ───────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minHeight: 0,
        padding: "4px 0 0 4px",
        background: "#0d0d1a",
      }}
      tabIndex={-1}
      onMouseDown={() => {
        setTimeout(() => termRef.current?.focus(), 0);
      }}
    />
  );
}
