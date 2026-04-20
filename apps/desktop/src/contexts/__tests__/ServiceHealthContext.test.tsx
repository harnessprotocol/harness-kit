import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ServiceHealthProvider, useServiceHealth } from "../ServiceHealthContext";

function TestConsumer() {
  const { services, aggregate, report } = useServiceHealth();
  const boardService = services.find(s => s.id === "board");
  return (
    <div>
      <span data-testid="aggregate">{aggregate}</span>
      <span data-testid="board-lastUp">{boardService?.lastUp ?? "null"}</span>
      <button onClick={() => report("board", "up")}>board-up</button>
      <button onClick={() => report("board", "down")}>board-down</button>
      <button onClick={() => report("membrain", "up")}>membrain-up</button>
      <button onClick={() => report("membrain", "down")}>membrain-down</button>
    </div>
  );
}

describe("ServiceHealthContext", () => {
  it("starts with aggregate all-up (no services started)", () => {
    render(<ServiceHealthProvider><TestConsumer /></ServiceHealthProvider>);
    expect(screen.getByTestId("aggregate").textContent).toBe("all-up");
  });

  it("aggregate becomes degraded when one service is down", () => {
    render(<ServiceHealthProvider><TestConsumer /></ServiceHealthProvider>);
    act(() => screen.getByText("board-down").click());
    expect(screen.getByTestId("aggregate").textContent).toBe("degraded");
  });

  it("aggregate returns to all-up when service recovers", () => {
    render(<ServiceHealthProvider><TestConsumer /></ServiceHealthProvider>);
    act(() => screen.getByText("board-down").click());
    act(() => screen.getByText("board-up").click());
    expect(screen.getByTestId("aggregate").textContent).toBe("all-up");
  });

  it("only counts services that have been started (left unknown)", () => {
    render(<ServiceHealthProvider><TestConsumer /></ServiceHealthProvider>);
    // board is up, membrain never started — aggregate should still be all-up
    act(() => screen.getByText("board-up").click());
    expect(screen.getByTestId("aggregate").textContent).toBe("all-up");
  });

  it("aggregate is all-down when all started services are down", () => {
    render(<ServiceHealthProvider><TestConsumer /></ServiceHealthProvider>);
    act(() => screen.getByText("board-down").click());
    act(() => screen.getByText("membrain-down").click());
    expect(screen.getByTestId("aggregate").textContent).toBe("all-down");
  });

  it("single downed service among unstarted others is degraded not all-down", () => {
    render(<ServiceHealthProvider><TestConsumer /></ServiceHealthProvider>);
    act(() => screen.getByText("board-down").click());
    // membrain is still "unknown" — not counted
    expect(screen.getByTestId("aggregate").textContent).toBe("degraded");
  });

  it("onTransition fires when status changes but not on same-status report", () => {
    const calls: string[] = [];
    function ListenerConsumer() {
      const { report, onTransition } = useServiceHealth();
      React.useEffect(() => onTransition((id, from, to) => { calls.push(`${id}:${from}→${to}`); }), [onTransition]);
      return (
        <div>
          <button onClick={() => report("board", "up")}>board-up</button>
          <button onClick={() => report("board", "up")}>board-up-again</button>
        </div>
      );
    }
    render(<ServiceHealthProvider><ListenerConsumer /></ServiceHealthProvider>);
    act(() => screen.getByText("board-up").click());
    act(() => screen.getByText("board-up-again").click()); // same status — should NOT fire
    expect(calls).toEqual(["board:unknown→up"]);
  });

  it("lastUp is set when status becomes up", () => {
    const before = Date.now();
    render(<ServiceHealthProvider><TestConsumer /></ServiceHealthProvider>);
    act(() => screen.getByText("board-up").click());
    const lastUpText = screen.getByTestId("board-lastUp").textContent;
    const lastUp = Number(lastUpText);
    expect(lastUp).toBeGreaterThanOrEqual(before);
    expect(lastUp).toBeLessThanOrEqual(Date.now());
  });

  it("useServiceHealth throws when used outside provider", () => {
    function Orphan() { useServiceHealth(); return null; }
    expect(() => render(<Orphan />)).toThrow("useServiceHealth must be used within ServiceHealthProvider");
  });
});
