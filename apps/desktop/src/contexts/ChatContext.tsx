import React, { createContext, useContext } from "react";
import { useChatRelay } from "../hooks/useChatRelay";
import type { UseChatRelayReturn } from "../hooks/useChatRelay";

export const ChatContext = createContext<UseChatRelayReturn | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const chat = useChatRelay();
  return <ChatContext.Provider value={chat}>{children}</ChatContext.Provider>;
}

export function useChat(): UseChatRelayReturn {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChat must be used inside <ChatProvider>");
  }
  return ctx;
}
