import type { ClaudeAccountInfo } from "../lib/tauri";

const fontStack = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

interface Props {
  account: ClaudeAccountInfo | null;
  monthlyTokens: number;
  loading?: boolean;
}

export default function AccountStatusBadge({ account, monthlyTokens, loading }: Props) {
  if (loading) {
    return (
      <div
        data-testid="account-badge-loading"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          padding: "6px 12px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "8px",
          fontFamily: fontStack,
        }}
      >
        <div
          style={{
            width: "48px",
            height: "10px",
            background: "var(--border-subtle)",
            borderRadius: "4px",
            animation: "pulse 1.4s ease-in-out infinite",
          }}
        />
        <div
          style={{
            width: "80px",
            height: "10px",
            background: "var(--border-subtle)",
            borderRadius: "4px",
            animation: "pulse 1.4s ease-in-out infinite",
          }}
        />
      </div>
    );
  }

  const loggedIn = account?.logged_in ?? false;

  return (
    <div
      data-testid="account-status-badge"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: "6px 12px",
        background: "var(--bg-surface)",
        border: "1px solid var(--border-base)",
        borderRadius: "8px",
        fontFamily: fontStack,
      }}
    >
      {loggedIn ? (
        <>
          {/* Detected indicator — presence of ~/.claude/ directory */}
          <span
            data-testid="account-connected-dot"
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              background: "var(--success, #16a34a)",
              flexShrink: 0,
            }}
          />
          <span
            data-testid="account-connected-label"
            style={{ fontSize: "12px", fontWeight: 500, color: "var(--fg-base)" }}
          >
            Claude Code
          </span>
          {/* Locally tracked token counter (not API quota) */}
          <span
            data-testid="account-token-count"
            style={{
              fontSize: "11px",
              color: "var(--fg-subtle)",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "4px",
              padding: "1px 6px",
            }}
          >
            {formatTokenCount(monthlyTokens)} tokens tracked this month
          </span>
        </>
      ) : (
        <span
          data-testid="account-not-logged-in"
          style={{ fontSize: "12px", color: "var(--fg-subtle)" }}
        >
          Not logged in
        </span>
      )}
    </div>
  );
}
