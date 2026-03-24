import type { AnyMessage } from "@harness-kit/shared";
import ChatBubble from "./ChatBubble";
import SystemEvent from "./SystemEvent";

interface Props {
  message: AnyMessage;
  currentNickname: string;
}

export default function MessageItem({ message, currentNickname }: Props) {
  if (message.type === "chat") {
    return (
      <ChatBubble
        message={message}
        isOwn={message.nickname === currentNickname}
      />
    );
  }

  if (message.type === "system") {
    return <SystemEvent message={message} />;
  }

  // share — Phase 4 placeholder
  return (
    <div
      style={{
        padding: "4px 12px",
        fontSize: "11px",
        color: "var(--fg-subtle)",
        fontStyle: "italic",
      }}
    >
      [{message.nickname} shared something — shares coming in Phase 4]
    </div>
  );
}
