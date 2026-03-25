import type { AnyMessage, ShareMessage } from "@harness-kit/shared";
import ShareCard from "./ShareCard";

interface Props {
  messages: AnyMessage[];
}

export default function SharesTab({ messages }: Props) {
  const shares = messages
    .filter((m): m is ShareMessage => m.type === "share")
    .reverse();

  if (shares.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <span style={{ fontSize: "20px", lineHeight: 1 }}>✦</span>
        <p style={{ margin: 0, fontSize: "12px", color: "var(--fg-subtle)" }}>
          No shares yet.
        </p>
        <p style={{ margin: 0, fontSize: "11px", color: "var(--fg-subtle)", maxWidth: "180px", lineHeight: "1.5" }}>
          Use "Share to Room" after syncing to share your config with the room.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        padding: "8px 0",
        overflowY: "auto",
      }}
    >
      {shares.map((share) => (
        <ShareCard key={share.id} message={share} />
      ))}
    </div>
  );
}
