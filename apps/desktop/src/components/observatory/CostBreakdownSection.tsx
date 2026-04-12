import { useMemo } from "react";
import { estimateCost, formatCost } from "../../lib/pricing";

interface ModelUsageEntry {
  inputTokens?: number;
  outputTokens?: number;
}

interface CostRow {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

interface Props {
  modelUsage: Record<string, ModelUsageEntry>;
}

const fontStack = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';

export default function CostBreakdownSection({ modelUsage }: Props) {
  const rows: CostRow[] = useMemo(() => {
    return Object.entries(modelUsage)
      .map(([model, usage]) => {
        const inputTokens  = usage.inputTokens  ?? 0;
        const outputTokens = usage.outputTokens ?? 0;
        return {
          model,
          inputTokens,
          outputTokens,
          cost: estimateCost(model, inputTokens, outputTokens),
        };
      })
      .filter((r) => r.inputTokens > 0 || r.outputTokens > 0)
      .sort((a, b) => b.cost - a.cost);
  }, [modelUsage]);

  if (rows.length === 0) {
    return (
      <div style={{
        padding: "24px",
        textAlign: "center",
        color: "var(--fg-subtle)",
        fontSize: "13px",
        fontFamily: fontStack,
      }}>
        No token usage data for this period.
      </div>
    );
  }

  return (
    <div style={{ fontFamily: fontStack, marginTop: "24px" }}>
      <h3 style={{
        margin: "0 0 12px",
        fontSize: "13px",
        fontWeight: 600,
        color: "var(--fg-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}>
        Cost Breakdown by Model
      </h3>

      <div style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-base)",
        borderRadius: "8px",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 120px 120px 90px",
          padding: "10px 16px",
          background: "var(--bg-elevated)",
          borderBottom: "1px solid var(--border-base)",
          fontSize: "11px",
          fontWeight: 600,
          color: "var(--fg-subtle)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}>
          <span>Model</span>
          <span style={{ textAlign: "right" }}>Input tokens</span>
          <span style={{ textAlign: "right" }}>Output tokens</span>
          <span style={{ textAlign: "right" }}>Est. cost</span>
        </div>

        {/* Rows */}
        {rows.map((row, i) => (
          <div
            key={row.model}
            data-testid="cost-row"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 120px 120px 90px",
              padding: "10px 16px",
              fontSize: "13px",
              color: "var(--fg-base)",
              borderBottom: i < rows.length - 1 ? "1px solid var(--border-subtle)" : "none",
            }}
          >
            <span style={{
              fontFamily: "monospace",
              fontSize: "12px",
              color: "var(--fg-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {row.model}
            </span>
            <span style={{ textAlign: "right", color: "var(--fg-muted)" }}>
              {row.inputTokens.toLocaleString()}
            </span>
            <span style={{ textAlign: "right", color: "var(--fg-muted)" }}>
              {row.outputTokens.toLocaleString()}
            </span>
            <span style={{
              textAlign: "right",
              fontWeight: 600,
              color: "var(--accent-text)",
            }}>
              {formatCost(row.cost)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
