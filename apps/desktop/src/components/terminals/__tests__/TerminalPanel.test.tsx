import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import TerminalPanel, { type TerminalPanelProps } from "../TerminalPanel";

// ── Stub ResizeObserver (not in jsdom) ─────────────────────────

beforeAll(() => {
  (globalThis as Record<string, unknown>).ResizeObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };
});

// ── Mock xterm.js (DOM-dependent, can't run in jsdom) ──────────

vi.mock("@xterm/xterm", () => {
  class MockTerminal {
    loadAddon = vi.fn();
    open = vi.fn();
    write = vi.fn();
    onData = vi.fn();
    dispose = vi.fn();
    focus = vi.fn();
    rows = 24;
    cols = 80;
  }
  return { Terminal: MockTerminal };
});

vi.mock("@xterm/addon-fit", () => {
  class MockFitAddon {
    fit = vi.fn();
  }
  return { FitAddon: MockFitAddon };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

// ── Helpers ────────────────────────────────────────────────────

const defaults: TerminalPanelProps = {
  terminalId: "term-1",
  title: "Terminal 1",
  status: "idle",
  rawChunks: [],
  onClose: vi.fn(),
  onInvoke: vi.fn(),
};

function renderPanel(overrides: Partial<TerminalPanelProps> = {}) {
  const props: TerminalPanelProps = {
    ...defaults,
    onClose: overrides.onClose ?? vi.fn(),
    onInvoke: overrides.onInvoke ?? vi.fn(),
    ...overrides,
  };
  return render(<TerminalPanel {...props} />);
}

function findStatusDot(container: HTMLElement) {
  const dots = container.querySelectorAll("div");
  return Array.from(dots).find((el) => el.style.borderRadius === "50%");
}

describe("TerminalPanel", () => {
  // ── Header rendering ───────────────────────────────────────

  it("displays the terminal title", () => {
    renderPanel({ title: "Terminal 3" });
    expect(screen.getByText("Terminal 3")).toBeInTheDocument();
  });

  it("displays harness name and model when assigned", () => {
    renderPanel({ harnessId: "claude", harnessName: "Claude Code", model: "claude-sonnet-4-6" });
    expect(screen.getByText("Claude Code · claude-sonnet-4-6")).toBeInTheDocument();
  });

  it("displays harness name without model", () => {
    renderPanel({ harnessName: "Claude Code" });
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
  });

  it("hides harness label when not assigned", () => {
    renderPanel();
    expect(screen.queryByText("Claude Code")).not.toBeInTheDocument();
  });

  // ── Button interactions ────────────────────────────────────

  it("fires onInvoke when invoke button is clicked", () => {
    const onInvoke = vi.fn();
    renderPanel({ onInvoke });
    fireEvent.click(screen.getByTitle("Invoke harness"));
    expect(onInvoke).toHaveBeenCalledOnce();
  });

  it("fires onClose when close button is clicked", () => {
    const onClose = vi.fn();
    renderPanel({ onClose });
    fireEvent.click(screen.getByTitle("Close terminal"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows expand button when onExpand is provided", () => {
    const onExpand = vi.fn();
    renderPanel({ onExpand });
    const btn = screen.getByTitle("Expand");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onExpand).toHaveBeenCalledOnce();
  });

  it("hides expand button when onExpand is not provided", () => {
    renderPanel();
    expect(screen.queryByTitle("Expand")).not.toBeInTheDocument();
  });

  // ── Status indicator ───────────────────────────────────────

  it("renders a status dot", () => {
    const { container } = renderPanel();
    expect(findStatusDot(container)).toBeTruthy();
  });

  it("uses green color for idle status", () => {
    const { container } = renderPanel({ status: "idle" });
    // jsdom normalizes hex to rgb
    expect(findStatusDot(container)?.style.background).toBe("rgb(34, 197, 94)");
  });

  it("uses green color for running status", () => {
    const { container } = renderPanel({ status: "running" });
    expect(findStatusDot(container)?.style.background).toBe("rgb(34, 197, 94)");
  });

  it("uses gray color for exited status", () => {
    const { container } = renderPanel({ status: "exited" });
    expect(findStatusDot(container)?.style.background).toBe("rgb(107, 114, 128)");
  });

  it("applies pulse animation only when idle", () => {
    const { container } = renderPanel({ status: "idle" });
    expect(findStatusDot(container)?.style.animation).toContain("terminal-pulse");
  });

  it("does not pulse when running", () => {
    const { container } = renderPanel({ status: "running" });
    expect(findStatusDot(container)?.style.animation).toBe("");
  });
});
