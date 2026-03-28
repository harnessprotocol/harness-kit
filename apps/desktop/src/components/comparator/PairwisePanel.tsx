import { useState, useEffect, useCallback, useRef } from "react";
import {
  createEvaluationSession,
  getEvaluationSession,
  revealEvaluationSession,
  savePairwiseVote,
  getPairwiseVotes,
  deletePairwiseVote,
} from "../../lib/tauri";
import type { EvaluationSession } from "@harness-kit/shared";

const VOTE_DIMENSIONS = [
  { key: "correctness",      label: "Correctness" },
  { key: "completeness",     label: "Completeness" },
  { key: "codeQuality",      label: "Code Quality" },
  { key: "efficiency",       label: "Efficiency" },
  { key: "reasoning",        label: "Reasoning Quality" },
  { key: "safety",           label: "Safety & Security" },
  { key: "contextAwareness", label: "Context Awareness" },
  { key: "autonomy",         label: "Autonomy & Tool Use" },
  { key: "adherence",        label: "Adherence & Polish" },
] as const;

type DimensionKey = (typeof VOTE_DIMENSIONS)[number]["key"];
type VoteResult = "left" | "right" | "tie";
type VoteMap = Partial<Record<DimensionKey, VoteResult>>;

interface PanelInfo {
  panelId: string;
  harnessName: string;
  model?: string;
}

interface PairwisePanelProps {
  comparisonId: string;
  panels: PanelInfo[];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function decodeBlindOrder(blindOrder: string): [string, string] {
  const parts = blindOrder.split(",");
  return [parts[0], parts[1]];
}

export default function PairwisePanel({ comparisonId, panels }: PairwisePanelProps) {
  const [session, setSession] = useState<EvaluationSession | null | undefined>(undefined);
  const [votes, setVotes] = useState<VoteMap>({});
  const [saving, setSaving] = useState<DimensionKey | null>(null);
  const votesRef = useRef<VoteMap>({});
  useEffect(() => { votesRef.current = votes; }, [votes]);

  useEffect(() => {
    getEvaluationSession(comparisonId)
      .then((s) => {
        setSession(s);
        if (s) {
          getPairwiseVotes(s.id).then((existing) => {
            const map: VoteMap = {};
            for (const v of existing) {
              map[v.dimension as DimensionKey] = v.result as VoteResult;
            }
            setVotes(map);
          }).catch(() => {});
        }
      })
      .catch(() => setSession(null));
  }, [comparisonId]);

  const handleStart = useCallback(async () => {
    if (panels.length < 2) return;
    const shuffled = shuffle(panels.map((p) => p.panelId));
    const blindOrder = shuffled.join(",");
    const id = crypto.randomUUID();
    try {
      const s = await createEvaluationSession(id, comparisonId, blindOrder);
      setSession(s);
    } catch (err) {
      console.error("Failed to create evaluation session:", err);
    }
  }, [comparisonId, panels]);

  const handleVote = useCallback(async (dim: DimensionKey, result: VoteResult) => {
    if (!session?.blindOrder) return;
    const [panelA, panelB] = decodeBlindOrder(session.blindOrder);
    if (!panelA || !panelB) return;
    const currentVote = votesRef.current[dim];
    const newResult = currentVote === result ? undefined : result;
    setVotes((prev) => ({ ...prev, [dim]: newResult }));
    if (!newResult) {
      try {
        await deletePairwiseVote(session.id, dim);
      } catch (err) {
        console.error("Failed to delete vote:", err);
        setVotes((prev) => ({ ...prev, [dim]: currentVote }));
      }
      return;
    }
    setSaving(dim);
    try {
      await savePairwiseVote(
        crypto.randomUUID(), comparisonId, session.id,
        panelA, panelB, dim, newResult,
      );
    } catch (err) {
      console.error("Failed to save vote:", err);
      setVotes((prev) => ({ ...prev, [dim]: currentVote }));
    } finally {
      setSaving(null);
    }
  }, [session, comparisonId]);

  const handleReveal = useCallback(async () => {
    if (!session) return;
    try {
      await revealEvaluationSession(session.id);
      setSession((prev) => prev ? { ...prev, revealedAt: new Date().toISOString() } : prev);
    } catch (err) {
      console.error("Failed to reveal session:", err);
    }
  }, [session]);

  if (session === undefined) {
    return <div className="pairwise-loading">Loading...</div>;
  }

  if (!session) {
    return (
      <div className="eval-cta-container">
        <button className="eval-cta" onClick={handleStart}>
          Start blind comparison
        </button>
        <p className="eval-cta-hint">
          Panel names are hidden until you reveal. Reduces evaluation bias.
        </p>
      </div>
    );
  }

  const [panelAId, panelBId] = decodeBlindOrder(session.blindOrder ?? "");
  if (!panelAId || !panelBId) {
    return <div className="pairwise-loading">Session data is invalid.</div>;
  }
  const panelA = panels.find((p) => p.panelId === panelAId);
  const panelB = panels.find((p) => p.panelId === panelBId);
  const isRevealed = !!session.revealedAt;
  const voted = Object.values(votes).filter(Boolean).length;
  const total = VOTE_DIMENSIONS.length;
  const allVoted = voted === total;

  if (isRevealed) {
    return (
      <div className="pairwise-results">
        <div className="pairwise-reveal-header">
          <span className="pairwise-label-reveal">Panel A</span>
          <span className="pairwise-label-eq">=</span>
          <span className="pairwise-harness-name">{panelA?.harnessName ?? panelAId}</span>
          {panelA?.model && <span className="pairwise-model">({panelA.model})</span>}
          <span className="pairwise-separator" />
          <span className="pairwise-label-reveal">Panel B</span>
          <span className="pairwise-label-eq">=</span>
          <span className="pairwise-harness-name">{panelB?.harnessName ?? panelBId}</span>
          {panelB?.model && <span className="pairwise-model">({panelB.model})</span>}
        </div>

        <table className="pairwise-results-table">
          <thead>
            <tr><th>Dimension</th><th>Winner</th></tr>
          </thead>
          <tbody>
            {VOTE_DIMENSIONS.map((dim) => {
              const v = votes[dim.key];
              const winnerName =
                v === "left"  ? (panelA?.harnessName ?? "Panel A") :
                v === "right" ? (panelB?.harnessName ?? "Panel B") :
                v === "tie"   ? "Tie" : "—";
              return (
                <tr key={dim.key}>
                  <td>{dim.label}</td>
                  <td className={`pairwise-result-cell ${v ?? "unvoted"}`}>{winnerName}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="pairwise-tally">
          {(() => {
            const aWins = Object.values(votes).filter((v) => v === "left").length;
            const bWins = Object.values(votes).filter((v) => v === "right").length;
            const ties  = Object.values(votes).filter((v) => v === "tie").length;
            const winner =
              aWins > bWins ? (panelA?.harnessName ?? "Panel A") :
              bWins > aWins ? (panelB?.harnessName ?? "Panel B") :
              "Tie";
            return <span><strong>{winner}</strong> leads — {aWins}W / {bWins}W / {ties}T</span>;
          })()}
        </div>
      </div>
    );
  }

  return (
    <div className="pairwise-voting">
      <div className="pairwise-progress">
        <span className="pairwise-progress-pill">{voted} / {total} voted</span>
        <button
          className="btn btn-primary btn-sm"
          disabled={!allVoted}
          title={allVoted ? undefined : "Vote on all dimensions to reveal"}
          onClick={handleReveal}
        >
          Reveal
        </button>
      </div>

      <table className="pairwise-vote-table">
        <thead>
          <tr>
            <th>Dimension</th>
            <th className="pairwise-col-panel">Panel A</th>
            <th className="pairwise-col-tie">Tie</th>
            <th className="pairwise-col-panel">Panel B</th>
          </tr>
        </thead>
        <tbody>
          {VOTE_DIMENSIONS.map((dim) => {
            const current = votes[dim.key];
            const isSaving = saving === dim.key;
            return (
              <tr key={dim.key} className="pairwise-vote-row">
                <td className="pairwise-dim-label">{dim.label}</td>
                {(["left", "tie", "right"] as VoteResult[]).map((result) => (
                  <td key={result} className="pairwise-vote-cell">
                    <button
                      className={`pairwise-vote-btn ${result}${current === result ? " selected" : ""}`}
                      onClick={() => handleVote(dim.key, result)}
                      disabled={isSaving}
                    >
                      {result === "left" ? "A" : result === "right" ? "B" : "Tie"}
                    </button>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
