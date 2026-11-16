import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { Tooltip } from "@harness-kit/ui";

afterEach(() => vi.useRealTimers());

function hover(el: Element) {
  fireEvent.mouseEnter(el);
}

describe("@harness-kit/ui Tooltip", () => {
  it("shows after the 500 ms delay on hover, not before", () => {
    vi.useFakeTimers();
    render(<Tooltip content="Refresh"><button>Go</button></Tooltip>);
    hover(screen.getByRole("button", { name: "Go" }));
    act(() => { vi.advanceTimersByTime(499); });
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Refresh");
  });

  it("hides on pointer leave", () => {
    vi.useFakeTimers();
    render(<Tooltip content="Refresh"><button>Go</button></Tooltip>);
    const btn = screen.getByRole("button", { name: "Go" });
    hover(btn);
    act(() => { vi.advanceTimersByTime(500); });
    fireEvent.mouseLeave(btn);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows on keyboard focus and hides on blur", () => {
    vi.useFakeTimers();
    render(<Tooltip content="Refresh"><button>Go</button></Tooltip>);
    const btn = screen.getByRole("button", { name: "Go" });
    fireEvent.focus(btn);
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.blur(btn);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("hides on Escape", () => {
    vi.useFakeTimers();
    render(<Tooltip content="Refresh"><button>Go</button></Tooltip>);
    const btn = screen.getByRole("button", { name: "Go" });
    fireEvent.focus(btn);
    act(() => { vi.advanceTimersByTime(500); });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("points the child's aria-describedby at the tooltip", () => {
    vi.useFakeTimers();
    render(<Tooltip content="Refresh"><button>Go</button></Tooltip>);
    const btn = screen.getByRole("button", { name: "Go" });
    fireEvent.focus(btn);
    act(() => { vi.advanceTimersByTime(500); });
    const tip = screen.getByRole("tooltip");
    expect(tip.id).toBeTruthy();
    expect(btn.getAttribute("aria-describedby")).toBe(tip.id);
  });

  it("still shows for a disabled child on hover", () => {
    vi.useFakeTimers();
    render(<Tooltip content="Nothing to refresh"><button disabled>Go</button></Tooltip>);
    const btn = screen.getByRole("button", { name: "Go" });
    hover(btn.parentElement!);
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Nothing to refresh");
  });

  it("shows nothing for empty content", () => {
    vi.useFakeTimers();
    render(<Tooltip content=""><button>Go</button></Tooltip>);
    hover(screen.getByRole("button", { name: "Go" }));
    act(() => { vi.advanceTimersByTime(600); });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows only the innermost tooltip when triggers are nested", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Outer">
        <div>
          <Tooltip content="Inner"><span>badge</span></Tooltip>
        </div>
      </Tooltip>,
    );
    hover(screen.getByText("badge"));
    act(() => { vi.advanceTimersByTime(500); });
    const tips = screen.getAllByRole("tooltip");
    expect(tips).toHaveLength(1);
    expect(tips[0]).toHaveTextContent("Inner");
  });
});
