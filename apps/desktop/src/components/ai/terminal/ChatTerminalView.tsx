/**
 * ChatTerminalView — xterm.js secondary tab for raw stream output.
 *
 * Forked from components/comparator/TerminalView.tsx.
 * Key differences: no PTY wiring, no Tauri invoke for I/O, no ResizeObserver→PTY.
 * Receives pre-converted ANSI text chunks and writes them directly to the terminal.
 */
import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export interface ChatTerminalViewProps {
  /** ANSI-encoded text chunks to write sequentially */
  chunks: string[];
  /** Bump to trigger re-render when chunks array is mutated in place */
  outputTick: number;
}

export default function ChatTerminalView({ chunks, outputTick }: ChatTerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const writtenRef = useRef(0);

  // ── Mount xterm ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 12,
      scrollback: 10000,
      convertEol: true,
      cursorBlink: false,
      disableStdin: true,
      theme: {
        background: '#0b0d12',
        foreground: '#d0d0dc',
        cursor: '#d0d0dc',
        selectionBackground: '#3a3a5c',
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fit.fit();
      });
    });

    termRef.current = term;
    fitRef.current = fit;
    writtenRef.current = 0;

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => fit.fit());
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      writtenRef.current = 0;
    };
  }, []);

  // ── Write new chunks to xterm ────────────────────────────────────────────

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    const start = writtenRef.current;
    if (start < chunks.length) {
      for (let i = start; i < chunks.length; i++) {
        term.write(chunks[i]);
      }
      writtenRef.current = chunks.length;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outputTick, chunks.length]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minHeight: 0,
        padding: '4px 0 0 4px',
        background: '#0b0d12',
      }}
      tabIndex={-1}
    />
  );
}
