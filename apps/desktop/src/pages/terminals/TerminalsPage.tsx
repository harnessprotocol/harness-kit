import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { HarnessInfo } from "@harness-kit/shared";
import { useTerminals } from "../../hooks/useTerminals";
import TerminalToolbar from "../../components/terminals/TerminalToolbar";
import TerminalGrid from "../../components/terminals/TerminalGrid";
import TerminalPanel from "../../components/terminals/TerminalPanel";
import InvokeDialog from "../../components/terminals/InvokeDialog";

// ── Helpers ──────────────────────────────────────────────────

/** Extract a project basename from a full path. */
function basename(path: string): string {
  const parts = path.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || "project";
}

// ── Styles ───────────────────────────────────────────────────

const styles = {
  page: {
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
    width: "100%",
    overflow: "hidden",
    background: "#1a1816",
  },
  empty: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    color: "#a09d98",
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    background: "#2a2825",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#666",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: 500,
    color: "#f2f1ed",
  },
  emptyHint: {
    fontSize: 12,
    color: "#a09d98",
  },
  gridCell: {
    overflow: "hidden",
    minHeight: 0,
    height: "100%",
  },
};

// ── Component ────────────────────────────────────────────────

export default function TerminalsPage() {
  const {
    sessions,
    createTerminal,
    destroyTerminal,
    assignHarness,
    invokeInTerminal,
    invokeAll,
    getRawChunks,
    maxTerminals,
  } = useTerminals();

  const [harnesses, setHarnesses] = useState<HarnessInfo[]>([]);
  const [projectPath, setProjectPath] = useState("");

  // Dialog state.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTerminalId, setDialogTerminalId] = useState<string | null>(null);
  const [dialogTitle, setDialogTitle] = useState("All Terminals");

  const didInit = useRef(false);

  // ── Detect harnesses + project path on mount ────────────────

  useEffect(() => {
    invoke<HarnessInfo[]>("detect_harnesses")
      .then(setHarnesses)
      .catch(console.error);

    // Use cwd or a sensible default.
    invoke<string>("get_cwd")
      .then(setProjectPath)
      .catch(() => setProjectPath("~/project"));
  }, []);

  // ── Auto-create first terminal ──────────────────────────────

  useEffect(() => {
    if (didInit.current || !projectPath) return;
    didInit.current = true;
    createTerminal(projectPath).catch(console.error);
  }, [projectPath, createTerminal]);

  // ── Keyboard shortcut: Cmd+T → new terminal ────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey && e.key === "t") {
        e.preventDefault();
        if (sessions.length < maxTerminals && projectPath) {
          createTerminal(projectPath).catch(console.error);
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [sessions.length, maxTerminals, projectPath, createTerminal]);

  // ── Dialog handlers ─────────────────────────────────────────

  const openInvokeFor = useCallback((terminalId: string, title: string) => {
    setDialogTerminalId(terminalId);
    setDialogTitle(title);
    setDialogOpen(true);
  }, []);

  const openInvokeAll = useCallback(() => {
    setDialogTerminalId(null);
    setDialogTitle("All Terminals");
    setDialogOpen(true);
  }, []);

  const handleDialogInvoke = useCallback(
    (harnessId: string, model: string, prompt: string) => {
      if (dialogTerminalId) {
        // Single terminal.
        assignHarness(dialogTerminalId, harnessId, model);
        invokeInTerminal(dialogTerminalId, harnessId, prompt, model).catch(console.error);
      } else {
        // Invoke all: assign harness to any that don't have one, then invoke.
        for (const s of sessions) {
          if (!s.harnessId) {
            assignHarness(s.id, harnessId, model);
          }
        }
        invokeAll(prompt).catch(console.error);
      }
    },
    [dialogTerminalId, sessions, assignHarness, invokeInTerminal, invokeAll],
  );

  // ── Render ──────────────────────────────────────────────────

  const projectName = basename(projectPath);

  return (
    <div style={styles.page}>
      <TerminalToolbar
        terminalCount={sessions.length}
        maxTerminals={maxTerminals}
        onNewTerminal={() => {
          if (projectPath) createTerminal(projectPath).catch(console.error);
        }}
        onInvokeAll={openInvokeAll}
        projectName={projectName}
      />

      {sessions.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
          </div>
          <span style={styles.emptyTitle}>No terminals open</span>
          <span style={styles.emptyHint}>
            Press <strong>&#8984;T</strong> or click <strong>+ New Terminal</strong> to start
          </span>
        </div>
      ) : (
        <TerminalGrid count={sessions.length}>
          {sessions.map((session) => {
            const harness = harnesses.find((h) => h.id === session.harnessId);
            return (
              <div key={session.id} style={styles.gridCell}>
                <TerminalPanel
                  terminalId={session.id}
                  title={session.title}
                  status={session.status}
                  harnessId={session.harnessId}
                  harnessName={harness?.name}
                  model={session.model}
                  rawChunks={getRawChunks(session.id)}
                  onClose={() => destroyTerminal(session.id)}
                  onInvoke={() => openInvokeFor(session.id, session.title)}
                />
              </div>
            );
          })}
        </TerminalGrid>
      )}

      <InvokeDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onInvoke={handleDialogInvoke}
        harnesses={harnesses}
        terminalTitle={dialogTitle}
      />
    </div>
  );
}
