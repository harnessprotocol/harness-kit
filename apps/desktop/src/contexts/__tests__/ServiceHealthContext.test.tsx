import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ServiceHealthProvider, useServiceHealth } from "../ServiceHealthContext";

function TestConsumer() {
  const { aggregate, report } = useServiceHealth();
  return (
    <div>
      <span data-testid="aggregate">{aggregate}</span>
      <button onClick={() => report("board", "up")}>board-up</button>
      <button onClick={() => report("board", "down")}>board-down</button>
      <button onClick={() => report("membrain", "up")}>membrain-up</button>
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
});
