import type { AnyMessage } from "@harness-kit/shared";
import ChatBubble from "./ChatBubble";
import ShareCard from "./ShareCard";
import SystemEvent from "./SystemEvent";

interface Props {
  message: AnyMessage;
  currentNickname: string;
}

export default function MessageItem({ message, currentNickname }: Props) {
  if (message.type === "chat") {
    return <ChatBubble message={message} isOwn={message.nickname === currentNickname} />;
  }

  if (message.type === "system") {
    return <SystemEvent message={message} />;
  }

  return <ShareCard message={message} />;
}
