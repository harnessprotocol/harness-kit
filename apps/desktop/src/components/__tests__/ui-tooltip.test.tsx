import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { Tooltip } from "@harness-kit/ui";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** jsdom has no focus modality, so tests say whether the focus counts as keyboard focus. */
function stubFocusVisible(result: boolean | "throws") {
  const real = Element.prototype.matches;
  vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, sel: string) {
    if (sel === ":focus-visible") {
      if (result === "throws") throw new SyntaxError("unsupported selector");
      return result;
    }
    return real.call(this, sel);
  });
}

/** Give the trigger a box and the tooltip a size; jsdom measures everything as zero. */
function stubLayout(trigger: Partial<DOMRect>, tip: { width: number; height: number }, viewport = { w: 1000, h: 800 }) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: viewport.w });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: viewport.h });
  const t = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}), ...trigger };
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this.getAttribute("role") === "tooltip") return { ...t, width: tip.width, height: tip.height } as DOMRect;
    if (this.tagName === "BUTTON") return t as DOMRect;
    return { ...t, width: 0, height: 0 } as DOMRect;
  });
}

function showTip() {
  act(() => { vi.advanceTimersByTime(500); });
  return screen.getByRole("tooltip");
}

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
    stubFocusVisible(true);
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
    stubFocusVisible(true);
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

  it("does not show on pointer focus", () => {
    stubFocusVisible(false);
    vi.useFakeTimers();
    render(<Tooltip content="Refresh"><button>Go</button></Tooltip>);
    fireEvent.focus(screen.getByRole("button", { name: "Go" }));
    act(() => { vi.advanceTimersByTime(600); });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows on focus where :focus-visible is unsupported", () => {
    stubFocusVisible("throws");
    vi.useFakeTimers();
    render(<Tooltip content="Refresh"><button>Go</button></Tooltip>);
    fireEvent.focus(screen.getByRole("button", { name: "Go" }));
    expect(showTip()).toHaveTextContent("Refresh");
  });

  it("places the tooltip below a trigger at the top of the window", () => {
    vi.useFakeTimers();
    stubLayout({ top: 0, bottom: 14, left: 100, width: 20, height: 14 }, { width: 80, height: 24 });
    render(<Tooltip content="Refresh"><button>Go</button></Tooltip>);
    hover(screen.getByRole("button", { name: "Go" }));
    expect(showTip().style.top).toBe("20px"); // bottom 14 + GAP 6
  });

  it("places the tooltip above a trigger with room above", () => {
    vi.useFakeTimers();
    stubLayout({ top: 400, bottom: 420, left: 100, width: 20, height: 20 }, { width: 80, height: 24 });
    render(<Tooltip content="Refresh"><button>Go</button></Tooltip>);
    hover(screen.getByRole("button", { name: "Go" }));
    expect(showTip().style.top).toBe("370px"); // 400 - 24 - 6
  });

  it("flips a bottom tooltip to the top when the window has no room below", () => {
    vi.useFakeTimers();
    stubLayout({ top: 780, bottom: 796, left: 100, width: 20, height: 16 }, { width: 80, height: 24 });
    render(<Tooltip content="Refresh" side="bottom"><button>Go</button></Tooltip>);
    hover(screen.getByRole("button", { name: "Go" }));
    expect(showTip().style.top).toBe("750px"); // 780 - 24 - 6
  });

  it("centres a short tooltip on its trigger using the tooltip's own width", () => {
    vi.useFakeTimers();
    stubLayout({ top: 400, bottom: 420, left: 300, width: 100, height: 20 }, { width: 40, height: 24 });
    render(<Tooltip content="Go"><button>Go</button></Tooltip>);
    hover(screen.getByRole("button", { name: "Go" }));
    expect(showTip().style.left).toBe("330px"); // 350 - 40 / 2
  });

  it("clamps a tooltip to the viewport edges by its own width", () => {
    vi.useFakeTimers();
    stubLayout({ top: 400, bottom: 420, left: 960, width: 40, height: 20 }, { width: 100, height: 24 });
    render(<Tooltip content="Refresh"><button>Go</button></Tooltip>);
    hover(screen.getByRole("button", { name: "Go" }));
    expect(showTip().style.left).toBe("892px"); // 1000 - 100 - 8
  });

  it("describes through a hidden element, not a visually hidden one", () => {
    render(<Tooltip content="Refresh"><span data-testid="plain">x</span></Tooltip>);
    const desc = document.getElementById(screen.getByTestId("plain").getAttribute("aria-describedby")!)!;
    expect(desc).toHaveAttribute("hidden");
    expect(desc.getAttribute("style")).toBeNull();
  });

  it("adds no description when the content repeats the child's aria-label", () => {
    render(<Tooltip content="Close"><button aria-label="Close">x</button></Tooltip>);
    expect(screen.getByRole("button", { name: "Close" })).not.toHaveAttribute("aria-describedby");
    expect(document.body.querySelector("[hidden]")).toBeNull();
  });

  it("adds no description when the content repeats the child's text", () => {
    render(<Tooltip content="Save"><button>Save</button></Tooltip>);
    expect(screen.getByRole("button", { name: "Save" })).not.toHaveAttribute("aria-describedby");
  });
});
