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

  it("points the child's aria-describedby at the text before any hover", () => {
    render(
      <>
        <Tooltip content="Refresh"><span data-testid="plain">x</span></Tooltip>
        <Tooltip content="Nothing to do"><button disabled>Go</button></Tooltip>
      </>,
    );
    const text = (el: HTMLElement) =>
      el.getAttribute("aria-describedby")!.split(" ").map((i) => document.getElementById(i)?.textContent).join(" ");
    expect(text(screen.getByTestId("plain"))).toBe("Refresh");
    expect(text(screen.getByRole("button", { name: "Go" }))).toBe("Nothing to do");
  });

  it("keeps an existing aria-describedby", () => {
    render(
      <>
        <p id="hint">Hint</p>
        <Tooltip content="Refresh"><button aria-describedby="hint">Go</button></Tooltip>
      </>,
    );
    const ids = screen.getByRole("button", { name: "Go" }).getAttribute("aria-describedby")!.split(" ");
    expect(ids[0]).toBe("hint");
    expect(ids).toHaveLength(2);
    expect(document.getElementById(ids[1])).toHaveTextContent("Refresh");
  });

  it("keeps the same DOM node and focus when disabled flips", () => {
    const ui = (disabled: boolean) => (
      <Tooltip content="Refresh"><button disabled={disabled}>Go</button></Tooltip>
    );
    const { rerender } = render(ui(false));
    const btn = screen.getByRole("button", { name: "Go" });
    btn.focus();
    expect(btn).toHaveFocus();
    rerender(ui(true));
    expect(screen.getByRole("button", { name: "Go" })).toBe(btn);
    rerender(ui(false));
    expect(screen.getByRole("button", { name: "Go" })).toBe(btn);
    expect(btn.isConnected).toBe(true);
    btn.focus();
    rerender(ui(false));
    expect(btn).toHaveFocus();
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
