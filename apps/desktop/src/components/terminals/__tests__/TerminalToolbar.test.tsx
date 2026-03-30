import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import TerminalToolbar from "../TerminalToolbar";

const defaults = {
  terminalCount: 3,
  maxTerminals: 12,
  onNewTerminal: vi.fn(),
  onInvokeAll: vi.fn(),
  projectName: "my-project",
};

function renderToolbar(overrides: Partial<typeof defaults> = {}) {
  const props = { ...defaults, ...overrides };
  // Reset mocks each render
  props.onNewTerminal = overrides.onNewTerminal ?? vi.fn();
  props.onInvokeAll = overrides.onInvokeAll ?? vi.fn();
  return render(<TerminalToolbar {...props} />);
}

describe("TerminalToolbar", () => {
  // ── Rendering ──────────────────────────────────────────────

  it("displays the project name", () => {
    renderToolbar({ projectName: "harness-kit" });
    expect(screen.getByText("harness-kit")).toBeInTheDocument();
  });

  it("displays the terminal counter", () => {
    renderToolbar({ terminalCount: 5, maxTerminals: 12 });
    expect(screen.getByText("5 / 12 terminals")).toBeInTheDocument();
  });

  it("shows settings button when onSettings is provided", () => {
    const onSettings = vi.fn();
    renderToolbar({ onSettings } as never);
    const btn = screen.getByTitle("Settings");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onSettings).toHaveBeenCalledOnce();
  });

  it("hides settings button when onSettings is not provided", () => {
    renderToolbar();
    expect(screen.queryByTitle("Settings")).not.toBeInTheDocument();
  });

  // ── Button interactions ────────────────────────────────────

  it("fires onNewTerminal when + New Terminal is clicked", () => {
    const onNewTerminal = vi.fn();
    renderToolbar({ onNewTerminal });
    fireEvent.click(screen.getByText("New Terminal"));
    expect(onNewTerminal).toHaveBeenCalledOnce();
  });

  it("fires onInvokeAll when Invoke All is clicked", () => {
    const onInvokeAll = vi.fn();
    renderToolbar({ onInvokeAll, terminalCount: 2 });
    fireEvent.click(screen.getByText("Invoke All"));
    expect(onInvokeAll).toHaveBeenCalledOnce();
  });

  // ── Disabled states ────────────────────────────────────────

  it("disables New Terminal when at max capacity", () => {
    renderToolbar({ terminalCount: 12, maxTerminals: 12 });
    const btn = screen.getByText("New Terminal").closest("button")!;
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", "Max 12 terminals");
  });

  it("enables New Terminal when below max capacity", () => {
    renderToolbar({ terminalCount: 11, maxTerminals: 12 });
    const btn = screen.getByText("New Terminal").closest("button")!;
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveAttribute("title", "New Terminal");
  });

  it("disables Invoke All when there are no terminals", () => {
    renderToolbar({ terminalCount: 0 });
    const btn = screen.getByText("Invoke All").closest("button")!;
    expect(btn).toBeDisabled();
  });

  it("enables Invoke All when terminals exist", () => {
    renderToolbar({ terminalCount: 1 });
    const btn = screen.getByText("Invoke All").closest("button")!;
    expect(btn).not.toBeDisabled();
  });

  // ── Keyboard shortcut hint ─────────────────────────────────

  it("shows Cmd+T keyboard shortcut hint", () => {
    renderToolbar();
    // ⌘T is rendered as the Unicode character
    expect(screen.getByText("⌘T")).toBeInTheDocument();
  });
});
