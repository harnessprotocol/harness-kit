import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SystemEvent from "../SystemEvent";
import type { SystemMessage } from "@harness-kit/shared";

// ── Helpers ───────────────────────────────────────────────────

function makeSystemMsg(
  event: SystemMessage["event"],
  nickname = "alice",
): SystemMessage {
  return {
    id: "sys-1",
    roomCode: "ABCD",
    type: "system",
    nickname,
    timestamp: new Date().toISOString(),
    event,
    detail: null,
  };
}

// ── Tests ─────────────────────────────────────────────────────

describe("SystemEvent", () => {
  it("join event renders '-- alice joined --'", () => {
    render(<SystemEvent message={makeSystemMsg("join")} />);
    expect(screen.getByText(/-- alice joined --/)).toBeInTheDocument();
  });

  it("leave event renders '-- alice left --'", () => {
    render(<SystemEvent message={makeSystemMsg("leave")} />);
    expect(screen.getByText(/-- alice left --/)).toBeInTheDocument();
  });

  it("room_created event renders '-- alice created this room --'", () => {
    render(<SystemEvent message={makeSystemMsg("room_created")} />);
    expect(screen.getByText(/-- alice created this room --/)).toBeInTheDocument();
  });
});
