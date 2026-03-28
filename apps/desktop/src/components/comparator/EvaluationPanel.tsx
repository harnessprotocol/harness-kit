import { useState, useEffect, useCallback, useRef } from "react";
import { Command } from "@tauri-apps/plugin-shell";
import { saveEvaluation, getEvaluations } from "../../lib/tauri";
import ScoreRadar from "./ScoreRadar";
import PairwisePanel from "./PairwisePanel";

const DIMENSIONS = [
  { key: "correctness", label: "Correctness" },
  { key: "completeness", label: "Completeness" },
  { key: "codeQuality", label: "Code Quality" },
  { key: "efficiency", label: "Efficiency" },
  { key: "reasoning", label: "Reasoning Quality" },
  { key: "speed", label: "Speed" },
  { key: "safety", label: "Safety & Security" },
  { key: "contextAwareness", label: "Context Awareness" },
  { key: "autonomy", label: "Autonomy & Tool Use" },
  { key: "adherence", label: "Adherence & Polish" },
] as const;

type DimensionKey = (typeof DIMENSIONS)[number]["key"];

/** Dimensions scored by AI (speed is always auto-calculated). */
const AI_SCORED_DIMENSIONS = DIMENSIONS.filter((d) => d.key !== "speed");

/** Dimension grouping for the evaluation table. */
const DIMENSION_GROUPS: { label: string; keys: DimensionKey[] }[] = [
  { label: "Quality", keys: ["correctness", "completeness", "codeQuality", "efficiency"] },
  { label: "Reasoning", keys: ["reasoning", "contextAwareness", "autonomy"] },
  { label: "Operational", keys: ["speed", "safety", "adherence"] },
];

const POPOVER_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

interface PanelInfo {
  panelId: string;
  harnessName: string;
  model?: string;
  durationMs: number | null;
  outputText?: string;
}

interface EvaluationPanelProps {
  comparisonId: string;
  panels: PanelInfo[];
  prompt?: string;
  readOnly?: boolean;
}

type ScoreMap = Record<string, Partial<Record<DimensionKey, number | null>>>;

type AiScoreState = "idle" | "scoring" | "done" | "error";

function computeOverall(scores: Partial<Record<DimensionKey, number | null>>): number | null {
  const vals = DIMENSIONS.map((d) => scores[d.key]).filter(
    (v): v is number => v != null,
  );
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

/** Compact score number display with click-to-edit popover */
function ScoreNumber({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <div
        className={`score-number${value != null ? " has-value" : ""}`}
        onClick={() => !disabled && setOpen((v) => !v)}
        role="button"
        tabIndex={0}
        aria-label={`Score: ${value ?? "unset"}`}
      >
        {value != null ? value : "--"}
      </div>
      {open && !disabled && (
        <div className="score-popover">
          <div style={{ display: "flex", gap: "2px", flexWrap: "nowrap" }}>
            {POPOVER_VALUES.map((n) => (
              <button
                key={n}
                type="button"
                className={`score-popover-btn${value === n ? " selected" : ""}`}
                onClick={() => {
                  onChange(value === n ? null : n);
                  setOpen(false);
                }}
              >
                {n}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "var(--fg-subtle)", marginTop: "3px", padding: "0 2px" }}>
            <span>Poor</span>
            <span>Avg</span>
            <span>Excellent</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Build the scoring prompt sent to Claude for AI evaluation. */
function buildScoringPrompt(
  prompt: string,
  panels: PanelInfo[],
): string {
  const dimensionList = AI_SCORED_DIMENSIONS.map((d) => `- ${d.key}: ${d.label}`).join("\n");

  const panelBlocks = panels
    .map(
      (p) =>
        `=== ${p.harnessName}${p.model ? ` (${p.model})` : ""} [panelId: ${p.panelId}] ===\n${p.outputText || "(no output)"}`,
    )
    .join("\n\n");

  return `You are evaluating AI coding tool responses. Rate each response on these dimensions using whole numbers 0-10:

${dimensionList}

The original prompt was:
${prompt}

Here are the responses:

${panelBlocks}

Return ONLY valid JSON with this exact structure — no markdown fencing, no commentary:
{
  "${panels[0]?.panelId || "panel-0"}": { "correctness": N, "completeness": N, "codeQuality": N, "efficiency": N, "reasoning": N, "safety": N, "contextAwareness": N, "autonomy": N, "adherence": N },
  ...one object per panel...
}

Every value must be an integer 0-10. Do not include "speed" — it is calculated separately.`;
}

/** Parse Claude's JSON response into a ScoreMap. */
function parseAiResponse(raw: string, panelIds: string[]): ScoreMap | null {
  try {
    // Strip markdown code fences if present
    let cleaned = raw.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "");
    }
    const parsed = JSON.parse(cleaned);
    if (typeof parsed !== "object" || parsed === null) return null;

    const result: ScoreMap = {};
    for (const pid of panelIds) {
      const entry = parsed[pid];
      if (!entry || typeof entry !== "object") continue;
      const dims: Partial<Record<DimensionKey, number | null>> = {};
      for (const d of AI_SCORED_DIMENSIONS) {
        const v = entry[d.key];
        if (typeof v === "number" && v >= 0 && v <= 10) {
          dims[d.key] = Math.round(v);
        }
      }
      result[pid] = dims;
    }
    return result;
  } catch {
    return null;
  }
}

export default function EvaluationPanel({
  comparisonId,
  panels,
  prompt = "",
  readOnly = false,
}: EvaluationPanelProps) {
  const [scores, setScores] = useState<ScoreMap>(() => {
    const init: ScoreMap = {};
    for (const p of panels) {
      const dims: Partial<Record<DimensionKey, number | null>> = {};
      for (const d of DIMENSIONS) {
        dims[d.key] = d.key === "speed" && p.durationMs != null
          ? Math.max(0, Math.min(10, Math.round((1 - p.durationMs / 600000) * 10)))
          : null;
      }
      init[p.panelId] = dims;
    }
    return init;
  });
  const [savedIds, setSavedIds] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Notes state: Record<panelId, notes string>
  const [notes, setNotes] = useState<Record<string, string>>({});

  // Whether manual scoring table is visible (starts hidden)
  const [showManualTable, setShowManualTable] = useState(false);

  // AI scoring state
  const [aiScores, setAiScores] = useState<ScoreMap>({});
  const [aiState, setAiState] = useState<AiScoreState>("idle");
  const [aiError, setAiError] = useState<string | null>(null);
  const [showAiScores, setShowAiScores] = useState(false);
  const [aiElapsed, setAiElapsed] = useState(0);
  const aiChildRef = useRef<{ kill: () => Promise<void> } | null>(null);
  const aiTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Undo state after accepting AI scores
  const [undoScores, setUndoScores] = useState<ScoreMap | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [evalMode, setEvalMode] = useState<"score" | "compare">("score");

  // Check if any scores have been set (for CTA vs table decision)
  const hasAnyScores = Object.values(scores).some((panelScores) =>
    Object.values(panelScores).some((v) => v != null && v !== null),
  );

  // Load existing evaluations
  useEffect(() => {
    getEvaluations(comparisonId).then((evals) => {
      if (evals.length === 0) return;
      const loaded: ScoreMap = { ...scores };
      const ids: Record<string, string> = {};
      const loadedNotes: Record<string, string> = {};
      for (const ev of evals) {
        ids[ev.panelId] = ev.id;
        loaded[ev.panelId] = {};
        for (const d of DIMENSIONS) {
          loaded[ev.panelId]![d.key] = ev[d.key] ?? null;
        }
        if (ev.notes) {
          loadedNotes[ev.panelId] = ev.notes;
        }
      }
      setScores(loaded);
      setSavedIds(ids);
      setNotes(loadedNotes);
      // If existing scores loaded, show the table
      const anyLoaded = Object.values(loaded).some((ps) =>
        Object.values(ps).some((v) => v != null),
      );
      if (anyLoaded) setShowManualTable(true);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparisonId]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (aiTimerRef.current) clearInterval(aiTimerRef.current);
      if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  const handleScoreChange = useCallback(
    (panelId: string, dim: DimensionKey, value: number | null) => {
      setScores((prev) => ({
        ...prev,
        [panelId]: { ...prev[panelId], [dim]: value },
      }));
    },
    [],
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const panel of panels) {
        const panelScores = scores[panel.panelId] || {};
        const overall = computeOverall(panelScores);
        const evalId = savedIds[panel.panelId] || crypto.randomUUID();
        await saveEvaluation({
          id: evalId,
          comparisonId,
          panelId: panel.panelId,
          correctness: panelScores.correctness ?? null,
          completeness: panelScores.completeness ?? null,
          codeQuality: panelScores.codeQuality ?? null,
          efficiency: panelScores.efficiency ?? null,
          reasoning: panelScores.reasoning ?? null,
          speed: panelScores.speed ?? null,
          safety: panelScores.safety ?? null,
          contextAwareness: panelScores.contextAwareness ?? null,
          autonomy: panelScores.autonomy ?? null,
          adherence: panelScores.adherence ?? null,
          overallScore: overall,
          notes: notes[panel.panelId] || null,
        });
        setSavedIds((prev) => ({ ...prev, [panel.panelId]: evalId }));
      }
    } catch (err) {
      console.error("Failed to save evaluation:", err);
    } finally {
      setSaving(false);
    }
  };

  /** Cancel an in-progress AI scoring run. */
  const handleCancelAi = useCallback(async () => {
    if (aiChildRef.current) {
      try { await aiChildRef.current.kill(); } catch { /* already dead */ }
      aiChildRef.current = null;
    }
    if (aiTimerRef.current) { clearInterval(aiTimerRef.current); aiTimerRef.current = null; }
    if (aiTimeoutRef.current) { clearTimeout(aiTimeoutRef.current); aiTimeoutRef.current = null; }
    setAiState("idle");
    setAiElapsed(0);
  }, []);

  /** Run Claude to score all panels and populate AI scores. */
  const handleScoreWithAi = async () => {
    const hasOutput = panels.some((p) => p.outputText && p.outputText.trim().length > 0);
    if (!hasOutput) {
      setAiError("No panel output available to score.");
      setAiState("error");
      return;
    }

    setAiState("scoring");
    setAiError(null);
    setAiElapsed(0);

    // Start elapsed timer
    const startTime = Date.now();
    aiTimerRef.current = setInterval(() => {
      setAiElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    try {
      const scoringPrompt = buildScoringPrompt(prompt, panels);
      const command = Command.create("claude", [
        "-p",
        scoringPrompt,
        "--output-format",
        "json",
      ]);

      // Collect stdout via events
      let stdoutChunks: string[] = [];
      let stderrChunks: string[] = [];

      command.stdout.on("data", (line: string) => {
        stdoutChunks.push(line);
      });
      command.stderr.on("data", (line: string) => {
        stderrChunks.push(line);
      });

      const child = await command.spawn();
      aiChildRef.current = child;

      // 90s timeout
      aiTimeoutRef.current = setTimeout(async () => {
        if (aiChildRef.current) {
          try { await aiChildRef.current.kill(); } catch { /* ignore */ }
          aiChildRef.current = null;
        }
      }, 90000);

      // Wait for close
      await new Promise<void>((resolve, reject) => {
        command.on("close", (data) => {
          if (aiTimerRef.current) { clearInterval(aiTimerRef.current); aiTimerRef.current = null; }
          if (aiTimeoutRef.current) { clearTimeout(aiTimeoutRef.current); aiTimeoutRef.current = null; }
          aiChildRef.current = null;

          if (data.code !== 0) {
            reject(new Error(stderrChunks.join("") || `Claude exited with code ${data.code}`));
          } else {
            resolve();
          }
        });
        command.on("error", (err) => {
          if (aiTimerRef.current) { clearInterval(aiTimerRef.current); aiTimerRef.current = null; }
          if (aiTimeoutRef.current) { clearTimeout(aiTimeoutRef.current); aiTimeoutRef.current = null; }
          aiChildRef.current = null;
          reject(new Error(err));
        });
      });

      let responseText = stdoutChunks.join("").trim();

      // --output-format json wraps the response in a JSON envelope with a "result" field
      try {
        const envelope = JSON.parse(responseText);
        if (typeof envelope === "object" && envelope !== null && typeof envelope.result === "string") {
          responseText = envelope.result;
        }
      } catch {
        // Not an envelope, use raw text
      }

      const panelIds = panels.map((p) => p.panelId);
      const parsed = parseAiResponse(responseText, panelIds);

      if (!parsed || Object.keys(parsed).length === 0) {
        throw new Error("Could not parse AI scoring response.");
      }

      // Merge speed scores from auto-calculation
      for (const p of panels) {
        if (parsed[p.panelId]) {
          const speedScore = scores[p.panelId]?.speed ?? null;
          parsed[p.panelId]!.speed = speedScore;
        }
      }

      setAiScores(parsed);
      setAiState("done");
      setShowAiScores(true);
      setShowManualTable(true);
    } catch (err) {
      console.error("Score with AI failed:", err);
      setAiError(err instanceof Error ? err.message : String(err));
      setAiState("error");
      if (aiTimerRef.current) { clearInterval(aiTimerRef.current); aiTimerRef.current = null; }
      if (aiTimeoutRef.current) { clearTimeout(aiTimeoutRef.current); aiTimeoutRef.current = null; }
    }
  };

  /** Copy AI scores into the human scores for saving, with undo support. */
  const handleAcceptAiScores = () => {
    // Stash current scores for undo
    const previousScores: ScoreMap = {};
    for (const [pid, dims] of Object.entries(scores)) {
      previousScores[pid] = { ...dims };
    }
    setUndoScores(previousScores);

    // Clear any existing undo timer
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => {
      setUndoScores(null);
      undoTimerRef.current = null;
    }, 10000);

    setScores((prev) => {
      const merged = { ...prev };
      for (const [panelId, aiDims] of Object.entries(aiScores)) {
        merged[panelId] = { ...merged[panelId] };
        for (const d of DIMENSIONS) {
          const aiVal = aiDims[d.key];
          if (aiVal != null) {
            merged[panelId]![d.key] = aiVal;
          }
        }
      }
      return merged;
    });
    setShowAiScores(false);
  };

  /** Undo the accepted AI scores, restoring previous values. */
  const handleUndo = () => {
    if (undoScores) {
      setScores(undoScores);
      setUndoScores(null);
      if (undoTimerRef.current) { clearTimeout(undoTimerRef.current); undoTimerRef.current = null; }
    }
  };

  // Build radar data — use AI scores overlay if showing
  const activeScores = showAiScores ? aiScores : scores;
  const radarPanels = panels.map((p) => ({
    panelId: p.panelId,
    harnessName: p.harnessName,
    scores: activeScores[p.panelId] || {},
  }));

  // Determine if we show the initial CTA or the scoring table
  const showCta = !readOnly && !showManualTable && !hasAnyScores && aiState === "idle";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {!readOnly && (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          padding: "8px 16px",
          borderBottom: "1px solid var(--border-base)",
          background: "var(--bg-surface)",
          flexShrink: 0,
        }}>
          <div className="eval-mode-toggle">
            <button
              className={`eval-mode-btn${evalMode === "score" ? " active" : ""}`}
              onClick={() => setEvalMode("score")}
            >
              Score
            </button>
            <button
              className={`eval-mode-btn${evalMode === "compare" ? " active" : ""}`}
              onClick={() => setEvalMode("compare")}
            >
              Compare
            </button>
          </div>
        </div>
      )}

      {evalMode === "compare" && !readOnly ? (
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {panels.length > 2 ? (
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              padding: "32px",
              textAlign: "center",
              color: "var(--fg-subtle)",
              fontSize: "13px",
            }}>
              Blind comparison supports 2 panels. Re-run with 2 tools to use this mode.
            </div>
          ) : (
            <PairwisePanel comparisonId={comparisonId} panels={panels} />
          )}
        </div>
      ) : (
      <div style={{ padding: "16px", flex: 1, overflow: "auto" }}>
        {/* CTA: default state when no scores exist */}
        {showCta && (
          <div className="eval-cta-container">
            <button
              className="eval-cta"
              onClick={handleScoreWithAi}
            >
              Score with AI
            </button>
            <button
              className="eval-cta-link"
              onClick={() => setShowManualTable(true)}
            >
              or score manually
            </button>
          </div>
        )}

        {/* AI scoring in-progress indicator (shown over CTA area when scoring from CTA) */}
        {aiState === "scoring" && !showManualTable && (
          <div className="eval-cta-container">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--fg-muted)" }}>
              <span className="ai-spinner" />
              Scoring... {aiElapsed}s
            </div>
            <button
              className="btn btn-sm btn-secondary"
              onClick={handleCancelAi}
              style={{ marginTop: "8px" }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Scoring table */}
        {(showManualTable || hasAnyScores || readOnly) && (
          <>
            <div style={{ overflowX: "auto" }}>
              <table className="eval-table">
                <thead>
                  <tr>
                    <th>Dimension</th>
                    {panels.map((p) => (
                      <th key={p.panelId} className="panel-header">
                        {p.harnessName}
                        {p.model && (
                          <div style={{ fontSize: "10px", fontWeight: 400, color: "var(--fg-subtle)" }}>
                            {p.model}
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DIMENSION_GROUPS.map((group) => (
                    <>
                      {/* Group header row */}
                      <tr key={`group-${group.label}`} className="eval-group-header">
                        <td colSpan={panels.length + 1}>{group.label}</td>
                      </tr>
                      {group.keys.map((dimKey) => {
                        const dim = DIMENSIONS.find((d) => d.key === dimKey)!;
                        return (
                          <tr key={dim.key}>
                            <td style={{ color: "var(--fg-muted)" }}>{dim.label}</td>
                            {panels.map((p) => {
                              const humanVal = scores[p.panelId]?.[dim.key] ?? null;
                              const aiVal = aiScores[p.panelId]?.[dim.key] ?? null;
                              const isAutoSpeed = dim.key === "speed";
                              return (
                                <td key={p.panelId} className="score-cell">
                                  {readOnly ? (
                                    <span className="score-number readonly">
                                      {humanVal != null ? humanVal : "--"}
                                    </span>
                                  ) : isAutoSpeed ? (
                                    <span className="score-auto-value">
                                      {humanVal != null ? humanVal : "--"}
                                      <span style={{ fontSize: "9px", color: "var(--fg-subtle)", marginLeft: "4px" }}>auto</span>
                                    </span>
                                  ) : (
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                                      {showAiScores && aiVal != null && (
                                        <div className="ai-score-badge">
                                          AI: {aiVal}
                                        </div>
                                      )}
                                      <ScoreNumber
                                        value={humanVal}
                                        onChange={(v) => handleScoreChange(p.panelId, dim.key, v)}
                                      />
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </>
                  ))}
                  {/* Overall score row */}
                  <tr className="overall-row">
                    <td>Overall</td>
                    {panels.map((p) => {
                      const src = showAiScores ? aiScores : scores;
                      const overall = computeOverall(src[p.panelId] || {});
                      return (
                        <td key={p.panelId}>
                          {overall != null ? overall.toFixed(1) : "--"}
                        </td>
                      );
                    })}
                  </tr>
                  {/* Notes rows */}
                  {panels.map((p) => (
                    <tr key={`notes-${p.panelId}`} className="eval-notes-row">
                      <td style={{ color: "var(--fg-muted)", verticalAlign: "top" }}>
                        {panels.length > 1 ? `Notes (${p.harnessName})` : "Notes"}
                      </td>
                      <td colSpan={panels.length}>
                        <textarea
                          className="eval-notes"
                          placeholder="Add evaluation notes..."
                          value={notes[p.panelId] || ""}
                          onChange={(e) =>
                            setNotes((prev) => ({ ...prev, [p.panelId]: e.target.value }))
                          }
                          readOnly={readOnly}
                          rows={2}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Action buttons */}
            {!readOnly && (
              <div style={{ display: "flex", gap: "8px", marginTop: "16px", alignItems: "center", flexWrap: "wrap" }}>
                <button
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={saving}
                  style={saving ? { cursor: "wait" } : undefined}
                >
                  {saving ? "Saving..." : "Save Scores"}
                </button>

                {aiState === "scoring" ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--fg-muted)" }}>
                      <span className="ai-spinner" />
                      Scoring... {aiElapsed}s
                    </span>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={handleCancelAi}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn btn-secondary"
                    onClick={handleScoreWithAi}
                  >
                    {aiState === "done" ? "Re-score with AI" : "Score with AI"}
                  </button>
                )}

                {showAiScores && aiState === "done" && (
                  <>
                    <button
                      className="btn btn-accent"
                      onClick={handleAcceptAiScores}
                    >
                      Accept AI Scores
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => setShowAiScores(false)}
                    >
                      Dismiss
                    </button>
                  </>
                )}

                {undoScores && (
                  <button
                    className="btn btn-secondary"
                    onClick={handleUndo}
                    style={{ fontSize: "11px" }}
                  >
                    Undo
                  </button>
                )}

                {aiState === "error" && aiError && (
                  <span style={{ fontSize: "11px", color: "var(--danger)", maxWidth: "300px" }}>
                    {aiError}
                  </span>
                )}
              </div>
            )}
          </>
        )}

        {/* Radar chart */}
        <div style={{ marginTop: "24px" }}>
          <ScoreRadar panels={radarPanels} />
        </div>
      </div>
      )}
    </div>
  );
}
