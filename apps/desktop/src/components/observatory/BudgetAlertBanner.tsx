import { useState } from "react";
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

  const tokenOver = tokenLimit != null && tokensToday > tokenLimit;
  const costOver = costLimit != null && costToday > costLimit;
  const isOver = tokenOver || costOver;

  if (!isOver || dismissed) return null;

  const messages: string[] = [];
  if (tokenOver && tokenLimit != null) {
    messages.push(
      `${tokensToday.toLocaleString()} tokens today (limit: ${tokenLimit.toLocaleString()})`,
    );
  }
  if (costOver && costLimit != null) {
    messages.push(`${formatCost(costToday)} today (limit: ${formatCost(costLimit)})`);
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
        background: "rgba(217,119,6,0.08)",
        border: "1px solid rgba(217,119,6,0.3)",
        fontFamily: fontStack,
        fontSize: "13px",
        color: "var(--fg-base)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
        <span style={{ fontSize: "16px", flexShrink: 0 }}>⚠</span>
        <div>
          <span style={{ fontWeight: 600, color: "#d97706" }}>Daily budget exceeded:&nbsp;</span>
          {messages.join(" · ")}
        </div>
      </div>

      <button
        data-testid="budget-dismiss-btn"
        onClick={handleDismiss}
        aria-label="Dismiss budget alert"
        style={{
          flexShrink: 0,
          border: "none",
          background: "none",
          color: "#d97706",
          cursor: "pointer",
          fontSize: "16px",
          lineHeight: 1,
          padding: "0 2px",
        }}
      >
        ×
      </button>
    </div>
  );
}
