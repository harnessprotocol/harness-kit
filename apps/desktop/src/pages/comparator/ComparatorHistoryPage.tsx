import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listComparisons, deleteComparison } from "../../lib/tauri";
import type { ComparisonSummary } from "@harness-kit/shared";
import { useArrowNavigation } from "../../hooks/useArrowNavigation";

export default function ComparatorHistoryPage() {
  const navigate = useNavigate();
  const [comparisons, setComparisons] = useState<ComparisonSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const { focusedIndex: histFocusedIndex, onKeyDown: onHistKeyDown } = useArrowNavigation({
    count: comparisons.length,
    onActivate: (i) => navigate(`/comparator/review/${comparisons[i].id}`),
  });

  const load = () => {
    setLoading(true);
    listComparisons(100, 0)
      .then(setComparisons)
      .catch((e) => console.error("Failed to load comparisons:", e))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteComparison(id);
      setComparisons((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  };

  const bestPanel = (comp: ComparisonSummary) => {
    // We don't have evaluation data in the summary view, so just show harnesses
    return comp.panels.map((p) => p.harnessName).join(" vs ");
  };

  return (
    <div style={{ padding: "20px 24px", maxWidth: "900px" }}>
      <h1 className="text-title" style={{ margin: "0 0 4px" }}>
        Comparison History
      </h1>
      <p className="text-caption" style={{ margin: "0 0 20px" }}>
        Saved comparisons. Click to review.
      </p>

      {loading && (
        <p className="text-caption">Loading...</p>
      )}

      {!loading && comparisons.length === 0 && (
        <div
          style={{
            padding: "40px",
            textAlign: "center",
            color: "var(--fg-subtle)",
            fontSize: "13px",
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ color: "var(--fg-subtle)", marginBottom: "10px" }}>
            <path d="M12 3v18M5 7l7-4 7 4M5 7l4 8H1L5 7zM19 7l4 8h-8l4-8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
          </svg>
          <p style={{ marginBottom: "8px" }}>No comparisons yet</p>
          <button
            onClick={() => navigate("/comparator")}
            style={{
              fontSize: "12px",
              fontWeight: 600,
              padding: "6px 16px",
              borderRadius: "6px",
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            New Comparison
          </button>
        </div>
      )}

      {!loading && comparisons.length > 0 && (
        <div className="row-list" tabIndex={0} onKeyDown={onHistKeyDown}>
          {comparisons.map((comp, idx) => (
            <div
              key={comp.id}
              className="row-list-item"
              onClick={() => navigate(`/comparator/review/${comp.id}`)}
              style={{ cursor: "pointer", gap: "12px", outline: histFocusedIndex === idx ? "2px solid var(--accent)" : "none", outlineOffset: "-2px" }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "var(--fg-base)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {comp.prompt}
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "var(--fg-subtle)",
                    marginTop: "2px",
                    display: "flex",
                    gap: "12px",
                  }}
                >
                  <span>{new Date(comp.createdAt).toLocaleDateString()}</span>
                  <span>{bestPanel(comp)}</span>
                </div>
              </div>

              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: "4px",
                  background:
                    comp.status === "complete"
                      ? "var(--success)"
                      : comp.status === "running"
                        ? "var(--accent-light)"
                        : "var(--warning)",
                  color:
                    comp.status === "complete"
                      ? "#fff"
                      : comp.status === "running"
                        ? "var(--accent-text)"
                        : "#fff",
                  flexShrink: 0,
                }}
              >
                {comp.status}
              </span>

              <button
                onClick={(e) => handleDelete(comp.id, e)}
                style={{
                  fontSize: "11px",
                  padding: "3px 8px",
                  borderRadius: "4px",
                  border: "1px solid var(--border-base)",
                  background: "transparent",
                  color: "var(--fg-subtle)",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
