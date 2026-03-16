import { useState, useEffect, useCallback } from "react";
import { saveEvaluation, getEvaluations } from "../../lib/tauri";
import ScoreRadar from "./ScoreRadar";

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

interface PanelInfo {
  panelId: string;
  harnessName: string;
  model?: string;
  durationMs: number | null;
}

interface EvaluationPanelProps {
  comparisonId: string;
  panels: PanelInfo[];
  readOnly?: boolean;
}

type ScoreMap = Record<string, Partial<Record<DimensionKey, number | null>>>;

function computeOverall(scores: Partial<Record<DimensionKey, number | null>>): number | null {
  const vals = DIMENSIONS.map((d) => scores[d.key]).filter(
    (v): v is number => v != null,
  );
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

export default function EvaluationPanel({
  comparisonId,
  panels,
  readOnly = false,
}: EvaluationPanelProps) {
  const [scores, setScores] = useState<ScoreMap>(() => {
    const init: ScoreMap = {};
    for (const p of panels) {
      const dims: Partial<Record<DimensionKey, number | null>> = {};
      for (const d of DIMENSIONS) {
        dims[d.key] = d.key === "speed" && p.durationMs != null
          ? Math.max(0, Math.min(10, Math.round((1 - p.durationMs / 600000) * 10 * 2) / 2))
          : null;
      }
      init[p.panelId] = dims;
    }
    return init;
  });
  const [savedIds, setSavedIds] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Load existing evaluations
  useEffect(() => {
    getEvaluations(comparisonId).then((evals) => {
      if (evals.length === 0) return;
      const loaded: ScoreMap = { ...scores };
      const ids: Record<string, string> = {};
      for (const ev of evals) {
        ids[ev.panelId] = ev.id;
        loaded[ev.panelId] = {};
        for (const d of DIMENSIONS) {
          loaded[ev.panelId]![d.key] = ev[d.key] ?? null;
        }
      }
      setScores(loaded);
      setSavedIds(ids);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparisonId]);

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
          notes: null,
        });
        setSavedIds((prev) => ({ ...prev, [panel.panelId]: evalId }));
      }
    } catch (err) {
      console.error("Failed to save evaluation:", err);
    } finally {
      setSaving(false);
    }
  };

  // Build radar data
  const radarPanels = panels.map((p) => ({
    panelId: p.panelId,
    harnessName: p.harnessName,
    scores: scores[p.panelId] || {},
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto" }}>
      {/* Score table */}
      <div style={{ padding: "16px", flex: 1 }}>
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
              {DIMENSIONS.map((dim) => (
                <tr key={dim.key}>
                  <td style={{ color: "var(--fg-muted)" }}>{dim.label}</td>
                  {panels.map((p) => {
                    const val = scores[p.panelId]?.[dim.key] ?? null;
                    return (
                      <td key={p.panelId} className="score-cell">
                        {readOnly ? (
                          <span style={{ fontSize: "12px", color: "var(--fg-base)" }}>
                            {val != null ? val.toFixed(1) : "--"}
                          </span>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "center" }}>
                            <input
                              type="range"
                              min="0"
                              max="10"
                              step="0.5"
                              value={val ?? 0}
                              onChange={(e) =>
                                handleScoreChange(p.panelId, dim.key, parseFloat(e.target.value))
                              }
                              style={{ width: "80px", accentColor: "var(--accent)" }}
                            />
                            <input
                              type="number"
                              min="0"
                              max="10"
                              step="0.5"
                              value={val ?? ""}
                              onChange={(e) => {
                                const v = e.target.value === "" ? null : parseFloat(e.target.value);
                                handleScoreChange(p.panelId, dim.key, v);
                              }}
                              style={{
                                width: "48px",
                                fontSize: "11px",
                                padding: "2px 4px",
                                borderRadius: "4px",
                                border: "1px solid var(--border-base)",
                                background: "var(--bg-surface)",
                                color: "var(--fg-base)",
                                textAlign: "center",
                              }}
                            />
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Overall score row */}
              <tr className="overall-row">
                <td>Overall</td>
                {panels.map((p) => {
                  const overall = computeOverall(scores[p.panelId] || {});
                  return (
                    <td key={p.panelId}>
                      {overall != null ? overall.toFixed(1) : "--"}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Action buttons */}
        {!readOnly && (
          <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
              style={saving ? { cursor: "wait" } : undefined}
            >
              {saving ? "Saving..." : "Save Scores"}
            </button>

            <button
              className="btn btn-secondary btn-disabled"
              disabled
              title="Coming soon"
            >
              Score with AI
            </button>
          </div>
        )}

        {/* Radar chart */}
        <div style={{ marginTop: "24px" }}>
          <ScoreRadar panels={radarPanels} />
        </div>
      </div>
    </div>
  );
}
