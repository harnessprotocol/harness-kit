import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TypingIndicator } from "../TypingIndicator";

// ── Tests ─────────────────────────────────────────────────────

describe("TypingIndicator", () => {
  it("renders nothing when there are 0 typing members", () => {
    const { container } = render(<TypingIndicator typingMembers={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders 'alice is typing…' for 1 member", () => {
    render(<TypingIndicator typingMembers={["alice"]} />);
    expect(screen.getByText("alice is typing…")).toBeInTheDocument();
  });

  it("renders 'alice and bob are typing…' for 2 members", () => {
    render(<TypingIndicator typingMembers={["alice", "bob"]} />);
    expect(screen.getByText("alice and bob are typing…")).toBeInTheDocument();
  });

  it("renders '3 people are typing…' for 3 members", () => {
    render(<TypingIndicator typingMembers={["alice", "bob", "carol"]} />);
    expect(screen.getByText("3 people are typing…")).toBeInTheDocument();
  });

  it("renders 'N people are typing…' for more than 3 members", () => {
    render(<TypingIndicator typingMembers={["a", "b", "c", "d", "e"]} />);
    expect(screen.getByText("5 people are typing…")).toBeInTheDocument();
  });
});
