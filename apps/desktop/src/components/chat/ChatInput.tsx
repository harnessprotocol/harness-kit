import { useState, useRef, useCallback } from "react";
import { useChat } from "../../context/ChatContext";

export default function ChatInput() {
  const { state, sendChat, sendTyping } = useChat();
  const [value, setValue] = useState("");
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const isDisabled = state.status !== "in_room";

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (value.trim()) {
          sendChat(value);
          setValue("");
          // Stop typing indicator
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
          if (isTypingRef.current) {
            sendTyping(false);
            isTypingRef.current = false;
          }
        }
        return;
      }

      // Typing indicator: debounced
      if (!isTypingRef.current) {
        sendTyping(true);
        isTypingRef.current = true;
      }
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        sendTyping(false);
        isTypingRef.current = false;
      }, 3000);
    },
    [value, sendChat, sendTyping],
  );

  return (
    <div
      style={{
        flexShrink: 0,
        padding: "8px 10px",
        borderTop: "1px solid var(--separator)",
      }}
    >
      <input
        type="text"
        className="form-input"
        placeholder={isDisabled ? "Not connected…" : "Message…"}
        value={value}
        disabled={isDisabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        style={{
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
          fontSize: "12px",
        }}
      />
    </div>
  );
}
