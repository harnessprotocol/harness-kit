import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ChatBubble from "../ChatBubble";
import type { ChatMessage } from "@harness-kit/shared";

// ── Helpers ───────────────────────────────────────────────────

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg-1",
    roomCode: "ABCD",
    type: "chat",
    nickname: "alice",
    // Fixed ISO timestamp so we can assert on the rendered time
    timestamp: "2025-06-15T14:05:00.000Z",
    body: "hello world",
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────

describe("ChatBubble rendering", () => {
  it("renders nickname and message body", () => {
    render(<ChatBubble message={makeMessage()} isOwn={false} />);
    expect(screen.getByText(/alice:/)).toBeInTheDocument();
    expect(screen.getByText("hello world")).toBeInTheDocument();
  });

  it("renders a HH:MM formatted timestamp", () => {
    render(<ChatBubble message={makeMessage()} isOwn={false} />);
    // The time string should match [HH:MM] pattern
    const timeEl = document.querySelector("span[style*='monospace']");
    expect(timeEl).not.toBeNull();
    expect(timeEl!.textContent).toMatch(/^\[\d{2}:\d{2}\]$/);
  });
});

describe("ChatBubble own-message styling", () => {
  it("own message: nickname has accent-text color", () => {
    render(<ChatBubble message={makeMessage({ nickname: "alice" })} isOwn={true} />);
    // Find the nickname span — it should have the accent color
    const spans = document.querySelectorAll("span");
    const nicknameSpan = Array.from(spans).find(
      (el) => el.textContent === "alice:",
    );
    expect(nicknameSpan).toBeDefined();
    expect(nicknameSpan!.style.color).toBe("var(--accent-text)");
  });

  it("other message: nickname has fg-base color", () => {
    render(<ChatBubble message={makeMessage({ nickname: "bob" })} isOwn={false} />);
    const spans = document.querySelectorAll("span");
    const nicknameSpan = Array.from(spans).find(
      (el) => el.textContent === "bob:",
    );
    expect(nicknameSpan).toBeDefined();
    expect(nicknameSpan!.style.color).toBe("var(--fg-base)");
  });
});
