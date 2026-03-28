import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { PanelState } from "../../../hooks/useComparison";

// -- Mock xterm.js --------------------------------------------------------
// Terminal renders to canvas; mock it to capture write() calls.

const mockWrite = vi.fn();
const mockDispose = vi.fn();
const mockLoadAddon = vi.fn();
const mockOpen = vi.fn();
const mockFit = vi.fn();

vi.mock("@xterm/xterm", () => {
  const TerminalCtor = function (this: Record<string, unknown>) {
    this.loadAddon = mockLoadAddon;
    this.open = mockOpen;
    this.write = mockWrite;
    this.dispose = mockDispose;
  } as unknown as { new (): unknown };
  return { Terminal: TerminalCtor };
});

vi.mock("@xterm/addon-fit", () => {
  const FitAddonCtor = function (this: Record<string, unknown>) {
    this.fit = mockFit;
  } as unknown as { new (): unknown };
  return { FitAddon: FitAddonCtor };
});

// CSS import -- no-op in tests
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

// PanelStatusBar uses setInterval for elapsed time -- mock to avoid timer noise
vi.mock("../PanelStatusBar", () => ({
  default: ({ panel }: { panel: PanelState }) => (
    <div data-testid="panel-status-bar">{panel.status}</div>
  ),
}));

// ResizeObserver not available in jsdom
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

import TerminalPane from "../TerminalView";

// -- Helpers ---------------------------------------------------------------

const makePanel = (overrides: Partial<PanelState> = {}): PanelState => ({
  panelId: "p1",
  harnessId: "claude",
  harnessName: "Claude Code",
  model: "claude-sonnet-4-6",
  outputLines: [],
  status: "running",
  exitCode: null,
  durationMs: 0,
  startedAt: Date.now(),
  ...overrides,
});

// -- Tests -----------------------------------------------------------------

describe("TerminalPane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders harness name and model badge", () => {
    render(<TerminalPane panel={makePanel()} onKill={vi.fn()} />);
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("claude-sonnet-4-6")).toBeInTheDocument();
  });

  it("shows Stop button when status is running", () => {
    render(<TerminalPane panel={makePanel({ status: "running" })} onKill={vi.fn()} />);
    expect(screen.getByText("Stop")).toBeInTheDocument();
  });

  it("hides Stop button when status is complete", () => {
    render(<TerminalPane panel={makePanel({ status: "complete" })} onKill={vi.fn()} />);
    expect(screen.queryByText("Stop")).not.toBeInTheDocument();
  });

  it("hides Stop button when status is killed", () => {
    render(<TerminalPane panel={makePanel({ status: "killed" })} onKill={vi.fn()} />);
    expect(screen.queryByText("Stop")).not.toBeInTheDocument();
  });

  it("calls onKill with panelId when Stop is clicked", () => {
    const onKill = vi.fn();
    render(<TerminalPane panel={makePanel()} onKill={onKill} />);
    fireEvent.click(screen.getByText("Stop"));
    expect(onKill).toHaveBeenCalledWith("p1");
  });

  it("writes initial outputLines to terminal on mount", () => {
    render(
      <TerminalPane panel={makePanel({ outputLines: ["line1\n", "line2\n"] })} onKill={vi.fn()} />,
    );
    expect(mockWrite).toHaveBeenCalledWith("line1\n");
    expect(mockWrite).toHaveBeenCalledWith("line2\n");
    expect(mockWrite).toHaveBeenCalledTimes(2);
  });

  it("only writes new lines on re-render, not already-written ones", () => {
    const { rerender } = render(
      <TerminalPane panel={makePanel({ outputLines: ["line1\n"] })} onKill={vi.fn()} />,
    );
    expect(mockWrite).toHaveBeenCalledTimes(1);

    rerender(
      <TerminalPane
        panel={makePanel({ outputLines: ["line1\n", "line2\n", "line3\n"] })}
        onKill={vi.fn()}
      />,
    );
    // Only the 2 new lines should be written
    expect(mockWrite).toHaveBeenCalledTimes(3);
    expect(mockWrite).toHaveBeenNthCalledWith(1, "line1\n");
    expect(mockWrite).toHaveBeenNthCalledWith(2, "line2\n");
    expect(mockWrite).toHaveBeenNthCalledWith(3, "line3\n");
  });

  it("disposes terminal on unmount", () => {
    const { unmount } = render(<TerminalPane panel={makePanel()} onKill={vi.fn()} />);
    unmount();
    expect(mockDispose).toHaveBeenCalled();
  });

  it("does not render model badge when model is undefined", () => {
    render(<TerminalPane panel={makePanel({ model: undefined })} onKill={vi.fn()} />);
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.queryByText("claude-sonnet-4-6")).not.toBeInTheDocument();
  });

  it("renders PanelStatusBar", () => {
    render(<TerminalPane panel={makePanel()} onKill={vi.fn()} />);
    expect(screen.getByTestId("panel-status-bar")).toBeInTheDocument();
  });
});
