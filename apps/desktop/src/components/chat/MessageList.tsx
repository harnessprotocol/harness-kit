import { useEffect, useRef } from "react";
import type { AnyMessage } from "@harness-kit/shared";
import MessageItem from "./MessageItem";

interface Props {
  messages: AnyMessage[];
  currentNickname: string;
}

export default function MessageList({ messages, currentNickname }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        paddingTop: "8px",
        paddingBottom: "8px",
      }}
    >
      {messages.length === 0 && (
        <div
          style={{
            textAlign: "center",
            fontSize: "12px",
            color: "var(--fg-subtle)",
            paddingTop: "32px",
          }}
        >
          No messages yet.
        </div>
      )}
      {messages.map((msg) => (
        <MessageItem
          key={msg.id}
          message={msg}
          currentNickname={currentNickname}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
