import { useCallback, useState } from "react";
import type { ComparisonState } from "../../hooks/useComparator";

// ── Design Tokens ───────────────────────────────────────────

const tokens = {
  bgBase: "#f4f2ef",
  bgSurface: "#faf9f7",
  bgElevated: "#ffffff",
  fgBase: "#181714",
  fgMuted: "#5c5a56",
  fgSubtle: "#9a9892",
  fgPlaceholder: "#bcbab5",
  borderBase: "rgba(0, 0, 0, 0.08)",
  borderStrong: "rgba(0, 0, 0, 0.14)",
  borderSubtle: "rgba(0, 0, 0, 0.05)",
  accent: "#5b50e8",
  accentLight: "rgba(91, 80, 232, 0.09)",
  accentFg: "#4338d4",
  accentText: "#5b50e8",
  success: "#16a34a",
  warning: "#d97706",
  danger: "#dc2626",
  hoverBg: "rgba(0, 0, 0, 0.04)",
};

const fontStack = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';
const monoStack = 'ui-monospace, "SF Mono", monospace';

// ── Types ───────────────────────────────────────────────────

interface JudgePhaseProps {
  active: ComparisonState;
}

type JudgeTab = "setup" | "results";

interface DimensionScore {
  label: string;
  score: number;
}

interface PanelVerdict {
  panelId: string;
  harnessName: string;
  isWinner: boolean;
  overallScore: number;
  dimensions: DimensionScore[];
}

interface JudgeResult {
  verdicts: PanelVerdict[];
  reasoning: string;
}

// ── Default rubric dimensions ───────────────────────────────

const DEFAULT_DIMENSIONS = [
  "Code quality",
  "Correctness",
  "Completeness",
  "Performance",
  "Readability",
  "Error handling",
];

const DEFAULT_PROMPT =
  "Evaluate the code quality, correctness, and completeness of each submission. Score each dimension 0-10.";

// ── Styles ──────────────────────────────────────────────────

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
    overflowY: "auto" as const,
    padding: "24px 28px",
    fontFamily: fontStack,
  } as React.CSSProperties,

  inner: {
    width: "100%",
    maxWidth: 720,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column" as const,
    gap: 24,
  } as React.CSSProperties,

  tabBar: {
    display: "flex",
    gap: 0,
    borderBottom: `1px solid ${tokens.borderBase}`,
  } as React.CSSProperties,

  tab: {
    padding: "8px 20px",
    fontSize: 13,
    fontWeight: 500,
    fontFamily: fontStack,
    background: "none",
    border: "none",
    borderBottom: "2px solid transparent",
    cursor: "pointer",
    color: tokens.fgMuted,
    transition: "color 150ms, border-color 150ms",
  } as React.CSSProperties,

  tabActive: {
    color: tokens.accent,
    borderBottomColor: tokens.accent,
  } as React.CSSProperties,

  card: {
    background: tokens.bgElevated,
    border: `1px solid ${tokens.borderBase}`,
    borderRadius: 8,
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
    padding: "24px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 20,
  } as React.CSSProperties,

  cardTitle: {
    fontSize: 17,
    fontWeight: 600,
    color: tokens.fgBase,
    fontFamily: fontStack,
    margin: 0,
  } as React.CSSProperties,

  cardSubtitle: {
    fontSize: 13,
    color: tokens.fgMuted,
    fontFamily: fontStack,
    marginTop: 2,
  } as React.CSSProperties,

  sectionLabel: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    color: tokens.fgSubtle,
    marginBottom: 8,
    fontFamily: fontStack,
  } as React.CSSProperties,

  radioList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  } as React.CSSProperties,

  radioOption: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 6,
    border: `1px solid ${tokens.borderBase}`,
    background: tokens.bgElevated,
    cursor: "pointer",
    transition: "all 150ms",
  } as React.CSSProperties,

  radioOptionSelected: {
    borderColor: tokens.accent,
    background: tokens.accentLight,
  } as React.CSSProperties,

  radioDot: {
    width: 14,
    height: 14,
    borderRadius: "50%",
    border: `2px solid ${tokens.borderStrong}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transition: "border-color 150ms",
  } as React.CSSProperties,

  radioDotSelected: {
    borderColor: tokens.accent,
  } as React.CSSProperties,

  radioDotInner: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: tokens.accent,
  } as React.CSSProperties,

  radioName: {
    fontSize: 13,
    fontWeight: 500,
    color: tokens.fgBase,
    fontFamily: fontStack,
  } as React.CSSProperties,

  modelBadge: {
    fontSize: 10,
    fontWeight: 500,
    color: tokens.fgMuted,
    background: tokens.borderSubtle,
    padding: "2px 7px",
    borderRadius: 4,
    fontFamily: monoStack,
  } as React.CSSProperties,

  promptArea: {
    width: "100%",
    minHeight: 100,
    padding: "12px 14px",
    fontFamily: monoStack,
    fontSize: 13,
    lineHeight: "1.6",
    color: tokens.fgBase,
    background: tokens.bgElevated,
    border: `1px solid ${tokens.borderBase}`,
    borderRadius: 8,
    outline: "none",
    resize: "vertical" as const,
    transition: "border-color 150ms, box-shadow 150ms",
  } as React.CSSProperties,

  rubricToggle: {
    fontSize: 12,
    fontWeight: 500,
    color: tokens.accentText,
    cursor: "pointer",
    background: "none",
    border: "none",
    padding: 0,
    fontFamily: fontStack,
    transition: "opacity 150ms",
  } as React.CSSProperties,

  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "4px 0",
    cursor: "pointer",
    fontSize: 13,
    color: tokens.fgBase,
    fontFamily: fontStack,
  } as React.CSSProperties,

  checkbox: {
    width: 14,
    height: 14,
    borderRadius: 3,
    border: `1.5px solid ${tokens.borderStrong}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transition: "all 150ms",
    cursor: "pointer",
  } as React.CSSProperties,

  checkboxChecked: {
    background: tokens.accent,
    borderColor: tokens.accent,
  } as React.CSSProperties,

  runBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    height: 42,
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    fontFamily: fontStack,
    cursor: "pointer",
    background: tokens.accent,
    color: "#ffffff",
    transition: "background 120ms, transform 60ms",
  } as React.CSSProperties,

  // Results styles
  verdictGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 16,
  } as React.CSSProperties,

  verdictCard: {
    background: tokens.bgElevated,
    border: `1px solid ${tokens.borderBase}`,
    borderRadius: 8,
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
    padding: "20px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 14,
  } as React.CSSProperties,

  verdictHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } as React.CSSProperties,

  verdictName: {
    fontSize: 14,
    fontWeight: 600,
    color: tokens.fgBase,
    fontFamily: fontStack,
  } as React.CSSProperties,

  winnerBadge: {
    fontSize: 9,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    color: "#ffffff",
    background: tokens.success,
    padding: "2px 8px",
    borderRadius: 4,
    fontFamily: fontStack,
  } as React.CSSProperties,

  scoreRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } as React.CSSProperties,

  scoreLabel: {
    width: 100,
    fontSize: 11,
    color: tokens.fgMuted,
    fontFamily: fontStack,
    flexShrink: 0,
  } as React.CSSProperties,

  scoreBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    background: tokens.borderSubtle,
    overflow: "hidden",
  } as React.CSSProperties,

  scoreBarFill: {
    height: "100%",
    borderRadius: 3,
    transition: "width 400ms ease",
  } as React.CSSProperties,

  scoreValue: {
    width: 24,
    fontSize: 11,
    fontWeight: 600,
    fontFamily: monoStack,
    textAlign: "right" as const,
    flexShrink: 0,
  } as React.CSSProperties,

  reasoningBlock: {
    background: tokens.bgElevated,
    border: `1px solid ${tokens.borderBase}`,
    borderRadius: 8,
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
    padding: "20px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  } as React.CSSProperties,

  reasoningLabel: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    color: tokens.fgSubtle,
    fontFamily: fontStack,
  } as React.CSSProperties,

  reasoningBody: {
    fontSize: 13,
    lineHeight: "1.7",
    color: tokens.fgBase,
    fontFamily: monoStack,
    whiteSpace: "pre-wrap" as const,
  } as React.CSSProperties,
};

// ── Helpers ─────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score > 7) return tokens.success;
  if (score >= 4) return tokens.warning;
  return tokens.danger;
}

/** Generate mock results for panels (MVP placeholder). */
function generateMockResults(panels: ComparisonState["panels"], dimensions: string[]): JudgeResult {
  const verdicts: PanelVerdict[] = panels.map((panel) => {
    const dimScores: DimensionScore[] = dimensions.map((label) => ({
      label,
      // Deterministic-ish scores seeded from panel + dimension name lengths.
      score: Math.min(10, Math.max(2, ((panel.harnessName.length * 3 + label.length * 7) % 9) + 2)),
    }));
    const overall = Math.round((dimScores.reduce((sum, d) => sum + d.score, 0) / dimScores.length) * 10) / 10;
    return {
      panelId: panel.id,
      harnessName: panel.harnessName,
      isWinner: false,
      overallScore: overall,
      dimensions: dimScores,
    };
  });

  // Mark the highest scorer as winner.
  if (verdicts.length > 0) {
    let best = 0;
    for (let i = 1; i < verdicts.length; i++) {
      if (verdicts[i].overallScore > verdicts[best].overallScore) best = i;
    }
    verdicts[best].isWinner = true;
  }

  const winnerName = verdicts.find((v) => v.isWinner)?.harnessName ?? "unknown";
  const reasoning = [
    `After evaluating all submissions across ${dimensions.length} dimensions, ${winnerName} produced the strongest overall result.`,
    "",
    `${winnerName} demonstrated particularly strong performance in ${dimensions[0]?.toLowerCase() ?? "overall quality"} and ${dimensions[1]?.toLowerCase() ?? "implementation"}.`,
    "",
    "All submissions completed the task, but differed in their approach to edge cases and code organization. The winning submission showed more thorough error handling and cleaner abstraction boundaries.",
  ].join("\n");

  return { verdicts, reasoning };
}

// ── Icons ───────────────────────────────────────────────────

function GavelIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M11.36 1.77L14.23 4.64C14.62 5.03 14.62 5.66 14.23 6.05L12.82 7.46L8.54 3.18L9.95 1.77C10.34 1.38 10.97 1.38 11.36 1.77ZM1 13.5L4.59 9.91L2.54 7.86L3.95 6.45L6 8.5L7.13 7.37L2.84 3.09L4.25 1.68L8.54 5.96L10 4.5L6.71 1.21L12.82 7.46L6.71 13.57L1 13.5Z" />
    </svg>
  );
}

function CheckSmallIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 8 7 12 13 4" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transition: "transform 150ms", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
    >
      <polyline points="6 4 10 8 6 12" />
    </svg>
  );
}

// ── Component ───────────────────────────────────────────────

export default function JudgePhase({ active }: JudgePhaseProps) {
  const [tab, setTab] = useState<JudgeTab>("setup");
  const [selectedHarness, setSelectedHarness] = useState<string>(
    active.panels[0]?.harnessName ?? "Claude Code",
  );
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [showRubric, setShowRubric] = useState(false);
  const [enabledDimensions, setEnabledDimensions] = useState<Set<string>>(
    new Set(DEFAULT_DIMENSIONS.slice(0, 3)),
  );
  const [results, setResults] = useState<JudgeResult | null>(null);

  // ── Toggle a rubric dimension ──────────────────────────────

  const toggleDimension = useCallback((dim: string) => {
    setEnabledDimensions((prev) => {
      const next = new Set(prev);
      if (next.has(dim)) {
        next.delete(dim);
      } else {
        next.add(dim);
      }
      return next;
    });
  }, []);

  // ── Run judge (MVP: mock) ──────────────────────────────────

  const handleRunJudge = useCallback(() => {
    const dims = Array.from(enabledDimensions);
    if (dims.length === 0) return;
    const mockResults = generateMockResults(active.panels, dims);
    setResults(mockResults);
    setTab("results");
  }, [active.panels, enabledDimensions]);

  // ── Build harness options for radio list ────────────────────

  const harnessOptions = active.panels.map((p) => ({
    name: p.harnessName,
    model: p.model,
  }));

  // Deduplicate by name (in case panels share a harness name).
  const uniqueHarnesses = harnessOptions.filter(
    (h, i, arr) => arr.findIndex((o) => o.name === h.name) === i,
  );

  // ── Render ─────────────────────────────────────────────────

  return (
    <div style={styles.container}>
      <div style={styles.inner}>
        {/* ── Tab Toggle ────────────────────────────────────── */}
        <div style={styles.tabBar}>
          <button
            style={{
              ...styles.tab,
              ...(tab === "setup" ? styles.tabActive : {}),
            }}
            onClick={() => setTab("setup")}
          >
            Setup
          </button>
          <button
            style={{
              ...styles.tab,
              ...(tab === "results" ? styles.tabActive : {}),
              ...(results === null ? { opacity: 0.4, cursor: "default" } : {}),
            }}
            onClick={() => {
              if (results) setTab("results");
            }}
          >
            Results
          </button>
        </div>

        {/* ── Setup View ────────────────────────────────────── */}
        {tab === "setup" && (
          <div style={styles.card}>
            {/* Header */}
            <div>
              <h2 style={styles.cardTitle}>Automated Judge</h2>
              <p style={styles.cardSubtitle}>
                Use a harness to evaluate each submission
              </p>
            </div>

            {/* Judge Harness Selection */}
            <div>
              <div style={styles.sectionLabel}>Judge Harness</div>
              <div style={styles.radioList}>
                {uniqueHarnesses.map((h) => {
                  const isSelected = selectedHarness === h.name;
                  return (
                    <div
                      key={h.name}
                      style={{
                        ...styles.radioOption,
                        ...(isSelected ? styles.radioOptionSelected : {}),
                      }}
                      onClick={() => setSelectedHarness(h.name)}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.background = tokens.hoverBg;
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.background = tokens.bgElevated;
                      }}
                    >
                      <div
                        style={{
                          ...styles.radioDot,
                          ...(isSelected ? styles.radioDotSelected : {}),
                        }}
                      >
                        {isSelected && <div style={styles.radioDotInner} />}
                      </div>
                      <span style={styles.radioName}>{h.name}</span>
                      {h.model && <span style={styles.modelBadge}>{h.model}</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Evaluation Prompt */}
            <div>
              <div style={styles.sectionLabel}>Evaluation Prompt</div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                style={styles.promptArea}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = tokens.accent;
                  e.currentTarget.style.boxShadow = `0 0 0 3px ${tokens.accentLight}`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = tokens.borderBase;
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>

            {/* Rubric Toggle */}
            <div>
              <button
                style={styles.rubricToggle}
                onClick={() => setShowRubric(!showRubric)}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.7"; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <ChevronIcon open={showRubric} />
                  {showRubric ? "Hide custom rubric" : "Show custom rubric"}
                </span>
              </button>

              {showRubric && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 2 }}>
                  {DEFAULT_DIMENSIONS.map((dim) => {
                    const isChecked = enabledDimensions.has(dim);
                    return (
                      <div
                        key={dim}
                        style={styles.checkboxRow}
                        onClick={() => toggleDimension(dim)}
                      >
                        <div
                          style={{
                            ...styles.checkbox,
                            ...(isChecked ? styles.checkboxChecked : {}),
                          }}
                        >
                          {isChecked && <CheckSmallIcon />}
                        </div>
                        <span>{dim}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Run Judge Button */}
            <button
              style={{
                ...styles.runBtn,
                ...(enabledDimensions.size === 0
                  ? { opacity: 0.5, cursor: "not-allowed" }
                  : {}),
              }}
              disabled={enabledDimensions.size === 0}
              onClick={handleRunJudge}
              onMouseEnter={(e) => {
                if (enabledDimensions.size === 0) return;
                e.currentTarget.style.background = tokens.accentFg;
                e.currentTarget.style.transform = "scale(0.99)";
              }}
              onMouseLeave={(e) => {
                if (enabledDimensions.size === 0) return;
                e.currentTarget.style.background = tokens.accent;
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              <GavelIcon />
              Run Judge
            </button>
          </div>
        )}

        {/* ── Results View ──────────────────────────────────── */}
        {tab === "results" && results && (
          <>
            {/* Verdict Grid */}
            <div style={styles.verdictGrid}>
              {results.verdicts.map((verdict) => (
                <div key={verdict.panelId} style={styles.verdictCard}>
                  {/* Header */}
                  <div style={styles.verdictHeader}>
                    <span style={styles.verdictName}>{verdict.harnessName}</span>
                    {verdict.isWinner && (
                      <span style={styles.winnerBadge}>Winner</span>
                    )}
                  </div>

                  {/* Score bars */}
                  {verdict.dimensions.map((dim) => (
                    <div key={dim.label} style={styles.scoreRow}>
                      <span style={styles.scoreLabel}>{dim.label}</span>
                      <div style={styles.scoreBarTrack}>
                        <div
                          style={{
                            ...styles.scoreBarFill,
                            width: `${dim.score * 10}%`,
                            background: scoreColor(dim.score),
                          }}
                        />
                      </div>
                      <span style={{ ...styles.scoreValue, color: scoreColor(dim.score) }}>
                        {dim.score}
                      </span>
                    </div>
                  ))}

                  {/* Overall */}
                  <div
                    style={{
                      marginTop: 4,
                      paddingTop: 10,
                      borderTop: `1px solid ${tokens.borderSubtle}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 600, color: tokens.fgMuted, fontFamily: fontStack }}>
                      Overall
                    </span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: scoreColor(verdict.overallScore), fontFamily: monoStack }}>
                      {verdict.overallScore}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Judge Reasoning */}
            <div style={styles.reasoningBlock}>
              <span style={styles.reasoningLabel}>Judge reasoning</span>
              <div style={styles.reasoningBody}>{results.reasoning}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
