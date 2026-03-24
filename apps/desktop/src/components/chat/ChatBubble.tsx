import type { ChatMessage } from "@harness-kit/shared";

interface Props {
  message: ChatMessage;
  isOwn: boolean;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function ChatBubble({ message, isOwn }: Props) {
  return (
    <div
      style={{
        padding: "2px 12px",
        lineHeight: 1.5,
        fontSize: "12px",
        wordBreak: "break-word",
      }}
    >
      <span
        style={{
          fontFamily: "ui-monospace, monospace",
          fontSize: "10px",
          color: "var(--fg-subtle)",
          marginRight: "6px",
          userSelect: "none",
        }}
      >
        [{formatTime(message.timestamp)}]
      </span>
      <span
        style={{
          fontWeight: 600,
          color: isOwn ? "var(--accent-text)" : "var(--fg-base)",
          marginRight: "4px",
        }}
      >
        {message.nickname}:
      </span>
      <span style={{ color: "var(--fg-base)" }}>{message.body}</span>
    </div>
  );
}
