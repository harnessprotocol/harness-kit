import { useEffect, useRef, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import {
  startComparison, killPanel, saveComparison, savePanelResult,
  getComparison, getComparisonDiffs,
  createWorktrees, removeWorktrees, getDiffAgainstCommit, saveFileDiffs,
} from "../../lib/tauri";
import { useComparison, type PanelState } from "../../hooks/useComparison";
import OutputPanel from "../../components/comparator/OutputPanel";
import DiffView from "../../components/comparator/DiffView";
import EvaluationPanel from "../../components/comparator/EvaluationPanel";
import ExportMenu from "../../components/comparator/ExportMenu";
import type { SelectedHarness } from "../../components/comparator/HarnessSelector";
import type { FileDiff } from "@harness-kit/shared";

const HARNESS_NAMES: Record<string, string> = {
  claude: "Claude Code",
  cursor: "Cursor",
  "gh-copilot": "GitHub Copilot",
};

type Tab = "output" | "diffs" | "evaluate";

export default function ComparatorRunPage() {
  const { comparisonId } = useParams<{ comparisonId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { state: compState, start, markKilled, loadDiffs } = useComparison();
  const startedRef = useRef(false);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("output");
  const worktreeMapRef = useRef<Record<string, string>>({});

  // Review mode: load from DB instead of live events
  const isReviewMode = location.pathname.startsWith("/comparator/review/");
  const [reviewLoaded, setReviewLoaded] = useState(false);
  const [reviewPanels, setReviewPanels] = useState<PanelState[]>([]);
  const [reviewDiffs, setReviewDiffs] = useState<Record<string, FileDiff[]>>({});
  const [reviewPrompt, setReviewPrompt] = useState("");

  const { prompt, workingDir, selected, pinnedCommit } = (location.state || {}) as {
    prompt?: string;
    workingDir?: string;
    selected?: SelectedHarness[];
    pinnedCommit?: string | null;
  };

  // Review mode: load comparison from DB
  useEffect(() => {
    if (!isReviewMode || !comparisonId || reviewLoaded) return;
    setReviewLoaded(true);

    getComparison(comparisonId).then((detail) => {
      setReviewPrompt(detail.prompt);
      setReviewPanels(
        detail.panels.map((p) => ({
          panelId: p.id,
          harnessId: p.harnessId,
          harnessName: p.harnessName,
          model: p.model ?? undefined,
          outputLines: p.outputText ? [p.outputText] : [],
          status: (p.status === "complete" ? "complete" : p.status === "killed" ? "killed" : "complete") as PanelState["status"],
          exitCode: p.exitCode,
          durationMs: p.durationMs ?? 0,
          startedAt: null,
        })),
      );

      // Load diffs
      const diffsMap: Record<string, FileDiff[]> = {};
      for (const p of detail.panels) {
        if (p.diffs.length > 0) {
          diffsMap[p.id] = p.diffs;
        }
      }
      setReviewDiffs(diffsMap);
    }).catch((err) => {
      console.error("Failed to load comparison:", err);
    });
  }, [isReviewMode, comparisonId, reviewLoaded]);

  // Live mode: start comparison on mount
  useEffect(() => {
    if (isReviewMode) return;
    if (startedRef.current || !comparisonId || !prompt || !selected?.length) return;
    startedRef.current = true;

    const panelIds = selected.map((_, i) => `panel-${i}`);
    const panels: PanelState[] = selected.map((s, i) => ({
      panelId: panelIds[i],
      harnessId: s.harnessId,
      harnessName: HARNESS_NAMES[s.harnessId] || s.harnessId,
      model: s.model,
      outputLines: [],
      status: "pending",
      exitCode: null,
      durationMs: 0,
      startedAt: null,
    }));

    start(comparisonId, prompt, workingDir || "", panels);

    // Persist comparison to DB
    saveComparison(
      comparisonId,
      prompt,
      workingDir || "",
      pinnedCommit ?? null,
      selected.map((s, i) => ({
        id: panelIds[i],
        harnessId: s.harnessId,
        harnessName: HARNESS_NAMES[s.harnessId] || s.harnessId,
        model: s.model,
      })),
    ).catch((err) => console.error("Failed to save comparison:", err));

    const launchComparison = async () => {
      const dir = workingDir || "";

      // Create worktrees if pinned to a commit
      let panelWorkingDirs: Record<string, string> = {};
      if (pinnedCommit && dir) {
        try {
          const worktrees = await createWorktrees(dir, comparisonId, panelIds, pinnedCommit);
          for (const wt of worktrees) {
            panelWorkingDirs[wt.panelId] = wt.worktreePath;
          }
          worktreeMapRef.current = panelWorkingDirs;
        } catch (err) {
          console.error("Failed to create worktrees, falling back to shared dir:", err);
        }
      }

      await startComparison({
        comparisonId,
        prompt,
        workingDir: dir,
        pinnedCommit: pinnedCommit ?? undefined,
        panels: selected.map((s, i) => ({
          panelId: panelIds[i],
          harnessId: s.harnessId,
          model: s.model,
          workingDir: panelWorkingDirs[panelIds[i]] || undefined,
        })),
      }).catch((err: unknown) => {
        console.error("Failed to start comparison:", err);
      });
    };

    requestAnimationFrame(() => { launchComparison(); });
  }, [comparisonId, prompt, workingDir, selected, pinnedCommit, start, isReviewMode]);

  // Save panel results exactly once per panel completion (live mode)
  const savedPanelsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (isReviewMode) return;
    for (const panel of compState.panels) {
      if (
        (panel.status === "complete" || panel.status === "killed") &&
        !savedPanelsRef.current.has(panel.panelId)
      ) {
        savedPanelsRef.current.add(panel.panelId);
        savePanelResult(
          compState.comparisonId,
          panel.panelId,
          panel.exitCode,
          panel.durationMs,
          panel.status,
          panel.outputLines.join(""),
        ).catch((err) => console.error("Failed to save panel result:", err));
      }
    }
  }, [compState.panels, compState.comparisonId, isReviewMode]);

  // Collect diffs and clean up worktrees when all panels complete (live mode)
  const diffsCollectedRef = useRef(false);
  useEffect(() => {
    if (isReviewMode || compState.phase !== "complete" || !comparisonId || diffsCollectedRef.current) return;
    diffsCollectedRef.current = true;

    const dir = workingDir || "";
    const commit = pinnedCommit;
    const wtMap = worktreeMapRef.current;
    const hasWorktrees = commit && Object.keys(wtMap).length > 0;

    const collectAndCleanup = async () => {
      if (hasWorktrees) {
        for (const panel of compState.panels) {
          const wtPath = wtMap[panel.panelId];
          if (!wtPath) continue;
          try {
            const diffs = await getDiffAgainstCommit(wtPath, commit);
            const fileDiffs = diffs.map((d) => ({
              filePath: d.filePath,
              diffText: d.diffText,
              changeType: d.changeType,
            }));
            if (fileDiffs.length > 0) {
              await saveFileDiffs(comparisonId, panel.panelId, fileDiffs);
              loadDiffs(panel.panelId, fileDiffs);
            }
          } catch (err) {
            console.error(`Failed to collect diffs for ${panel.panelId}:`, err);
          }
        }

        removeWorktrees(dir, comparisonId).catch((err) =>
          console.error("Failed to remove worktrees:", err),
        );
      } else {
        getComparisonDiffs(comparisonId).then((panelDiffs) => {
          for (const pd of panelDiffs) {
            loadDiffs(pd.panelId, pd.diffs);
          }
        }).catch(() => {});
      }
    };

    collectAndCleanup();
  }, [compState.phase, comparisonId, isReviewMode, loadDiffs, compState.panels, pinnedCommit, workingDir]);

  const handleKill = async (panelId: string) => {
    if (!comparisonId) return;
    try {
      await killPanel(comparisonId, panelId);
      markKilled(panelId);
    } catch (err) {
      console.error("Failed to kill panel:", err);
    }
  };

  const handleStopAll = () => {
    const running = activePanels.filter((p) => p.status === "running");
    Promise.all(running.map((p) => handleKill(p.panelId)));
  };

  const handleRerun = () => {
    if (comparisonId) {
      navigate("/comparator", { state: { replayFrom: comparisonId } });
    }
  };

  // Use review panels or live panels
  const activePanels = isReviewMode ? reviewPanels : compState.panels;
  const activePhase = isReviewMode ? "complete" : compState.phase;
  const activePrompt = isReviewMode ? reviewPrompt : prompt;
  const activeDiffs = isReviewMode ? reviewDiffs : (compState.diffs || {});

  const hasRunning = activePanels.some((p) => p.status === "running");
  const isComplete = activePhase === "complete";

  // Build diff panels data for DiffView
  const diffPanels = activePanels.map((p) => ({
    panelId: p.panelId,
    harnessName: p.harnessName,
    diffs: activeDiffs[p.panelId] || [],
  }));

  // Build eval panels info
  const evalPanels = activePanels.map((p) => ({
    panelId: p.panelId,
    harnessName: p.harnessName,
    model: p.model,
    durationMs: p.durationMs,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Prompt banner */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "10px 16px",
          borderBottom: "1px solid var(--border-base)",
          background: "var(--bg-surface)",
          flexShrink: 0,
        }}
      >
        <div
          onClick={() => setPromptExpanded((v) => !v)}
          style={{
            flex: 1,
            fontSize: "12px",
            fontFamily: "ui-monospace, monospace",
            color: "var(--fg-muted)",
            cursor: "pointer",
            overflow: "hidden",
            whiteSpace: promptExpanded ? "pre-wrap" : "nowrap",
            textOverflow: promptExpanded ? "unset" : "ellipsis",
          }}
        >
          {activePrompt || "No prompt"}
        </div>

        <div style={{ display: "flex", gap: "8px", flexShrink: 0, alignItems: "center" }}>
          {isComplete && comparisonId && <ExportMenu comparisonId={comparisonId} />}

          {isComplete && (
            <button
              onClick={handleRerun}
              style={{
                fontSize: "11px",
                fontWeight: 500,
                padding: "4px 12px",
                borderRadius: "6px",
                border: "1px solid var(--accent)",
                background: "transparent",
                color: "var(--accent-text)",
                cursor: "pointer",
              }}
            >
              Re-run
            </button>
          )}

          {hasRunning && (
            <button
              onClick={handleStopAll}
              style={{
                fontSize: "11px",
                fontWeight: 600,
                padding: "4px 12px",
                borderRadius: "6px",
                border: "1px solid var(--danger)",
                background: "transparent",
                color: "var(--danger)",
                cursor: "pointer",
              }}
            >
              Stop All
            </button>
          )}
          <button
            onClick={() => navigate("/comparator")}
            style={{
              fontSize: "11px",
              fontWeight: 500,
              padding: "4px 12px",
              borderRadius: "6px",
              border: "1px solid var(--border-base)",
              background: "transparent",
              color: "var(--fg-muted)",
              cursor: "pointer",
            }}
          >
            New
          </button>
        </div>
      </div>

      {/* Tabs (shown when complete) */}
      {isComplete && (
        <div
          style={{
            display: "flex",
            gap: "0",
            borderBottom: "1px solid var(--border-base)",
            flexShrink: 0,
          }}
        >
          {(["output", "diffs", "evaluate"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                fontSize: "12px",
                fontWeight: activeTab === tab ? 600 : 400,
                padding: "8px 20px",
                border: "none",
                borderBottom: activeTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
                background: "transparent",
                color: activeTab === tab ? "var(--accent-text)" : "var(--fg-muted)",
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {tab === "evaluate" ? "Evaluate" : tab === "diffs" ? "Diffs" : "Output"}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {(activeTab === "output" || !isComplete) && (
        <div
          style={{
            display: "flex",
            gap: "1px",
            flex: 1,
            minHeight: 0,
            background: "var(--separator)",
          }}
        >
          {activePanels.map((panel) => (
            <div
              key={panel.panelId}
              style={{ flex: 1, minWidth: 0, display: "flex", background: "var(--bg-base)" }}
            >
              <OutputPanel panel={panel} onKill={handleKill} />
            </div>
          ))}

          {activePanels.length === 0 && (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--bg-base)",
                color: "var(--fg-subtle)",
                fontSize: "13px",
              }}
            >
              {isReviewMode ? "Loading comparison..." : "Starting comparison..."}
            </div>
          )}
        </div>
      )}

      {isComplete && activeTab === "diffs" && (
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <DiffView panels={diffPanels} />
        </div>
      )}

      {isComplete && activeTab === "evaluate" && comparisonId && (
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <EvaluationPanel
            comparisonId={comparisonId}
            panels={evalPanels}
            readOnly={isReviewMode}
          />
        </div>
      )}
    </div>
  );
}
