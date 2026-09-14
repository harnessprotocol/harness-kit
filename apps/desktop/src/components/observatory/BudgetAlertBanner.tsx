import { useState } from "react";
import { TriangleAlert, X } from "lucide-react";
import { formatCost } from "../../lib/pricing";

interface Props {
  tokensToday: number;
  tokenLimit?: number;
  costToday: number;
  costLimit?: number;
  onDismiss?: () => void;
}

const fontStack = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';

export default function BudgetAlertBanner({
  tokensToday,
  tokenLimit,
  costToday,
  costLimit,
  onDismiss,
}: Props) {
  const [dismissed, setDismissed] = useState(false);

  const tokenOver  = tokenLimit != null && tokensToday > tokenLimit;
  const costOver   = costLimit  != null && costToday  > costLimit;
  const isOver     = tokenOver || costOver;

  if (!isOver || dismissed) return null;

  const messages: string[] = [];
  if (tokenOver && tokenLimit != null) {
    messages.push(
      `${tokensToday.toLocaleString()} tokens today (limit: ${tokenLimit.toLocaleString()})`,
    );
  }
  if (costOver && costLimit != null) {
    messages.push(
      `${formatCost(costToday)} today (limit: ${formatCost(costLimit)})`,
    );
  }

  function handleDismiss() {
    setDismissed(true);
    onDismiss?.();
  }

  return (
    <div
      role="alert"
      data-testid="budget-alert-banner"
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "12px",
        padding: "12px 16px",
        marginBottom: "20px",
        borderRadius: "8px",
        background: "var(--warning-light)",
        fontFamily: fontStack,
        fontSize: "13px",
        color: "var(--fg-base)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <TriangleAlert size={16} strokeWidth={1.7} aria-hidden="true" style={{ color: "var(--warning)", flexShrink: 0 }} />
        <div>
          <span style={{ fontWeight: 600, color: "var(--warning)" }}>
            Daily budget exceeded:&nbsp;
          </span>
          {messages.join(" · ")}
        </div>
      </div>

      <button
        data-testid="budget-dismiss-btn"
        onClick={handleDismiss}
        aria-label="Dismiss budget alert"
        style={{
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          border: "none",
          background: "none",
          color: "var(--warning)",
          cursor: "pointer",
          lineHeight: 1,
          padding: "0 2px",
        }}
      >
        <X size={13} strokeWidth={1.7} aria-hidden="true" />
      </button>
    </div>
  );
}
