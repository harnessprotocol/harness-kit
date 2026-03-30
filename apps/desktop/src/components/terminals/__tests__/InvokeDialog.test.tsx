import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import InvokeDialog from "../InvokeDialog";
import type { HarnessInfo } from "@harness-kit/shared";

// ── Fixtures ───────────────────────────────────────────────────

const claude: HarnessInfo = {
  id: "claude",
  name: "Claude Code",
  command: "claude",
  available: true,
  version: "1.0.0",
  authenticated: true,
  models: ["claude-sonnet-4-6", "claude-opus-4-6"],
  defaultModel: "claude-sonnet-4-6",
};

const copilot: HarnessInfo = {
  id: "gh-copilot",
  name: "GitHub Copilot",
  command: "gh",
  available: true,
  authenticated: true,
  models: ["gpt-4o"],
  defaultModel: "gpt-4o",
};

const harnesses = [claude, copilot];

const defaults = {
  open: true,
  onClose: vi.fn(),
  onInvoke: vi.fn(),
  harnesses,
  terminalTitle: "Terminal 1",
};

function renderDialog(overrides: Partial<typeof defaults> = {}) {
  const props = {
    ...defaults,
    onClose: overrides.onClose ?? vi.fn(),
    onInvoke: overrides.onInvoke ?? vi.fn(),
    ...overrides,
  };
  return render(<InvokeDialog {...props} />);
}

describe("InvokeDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Visibility ─────────────────────────────────────────────

  it("renders nothing when closed", () => {
    renderDialog({ open: false });
    expect(screen.queryByText("Invoke in Terminal 1")).not.toBeInTheDocument();
  });

  it("renders the dialog when open", () => {
    renderDialog();
    expect(screen.getByText("Invoke in Terminal 1")).toBeInTheDocument();
  });

  it("displays the terminal title", () => {
    renderDialog({ terminalTitle: "All Terminals" });
    expect(screen.getByText("Invoke in All Terminals")).toBeInTheDocument();
  });

  // ── Form defaults ──────────────────────────────────────────

  it("selects the first harness by default", () => {
    renderDialog();
    const select = screen.getAllByRole("combobox")[0] as HTMLSelectElement;
    expect(select.value).toBe("claude");
  });

  it("selects the default model of the first harness", () => {
    renderDialog();
    const select = screen.getAllByRole("combobox")[1] as HTMLSelectElement;
    expect(select.value).toBe("claude-sonnet-4-6");
  });

  it("shows all models for selected harness", () => {
    renderDialog();
    expect(screen.getByText("claude-sonnet-4-6")).toBeInTheDocument();
    expect(screen.getByText("claude-opus-4-6")).toBeInTheDocument();
  });

  // ── Harness switching ──────────────────────────────────────

  it("updates models when harness changes", async () => {
    renderDialog();
    const harnessSelect = screen.getAllByRole("combobox")[0];

    fireEvent.change(harnessSelect, { target: { value: "gh-copilot" } });

    await waitFor(() => {
      const modelSelect = screen.getAllByRole("combobox")[1] as HTMLSelectElement;
      expect(modelSelect.value).toBe("gpt-4o");
    });
  });

  // ── Validation ─────────────────────────────────────────────

  it("disables invoke button when prompt is empty", () => {
    renderDialog();
    const invokeBtn = screen.getByText("Invoke").closest("button")!;
    expect(invokeBtn).toBeDisabled();
  });

  it("enables invoke button when prompt has text", async () => {
    renderDialog();
    const textarea = screen.getByPlaceholderText("Describe the task...");
    await userEvent.type(textarea, "Fix the bug");

    const invokeBtn = screen.getByText("Invoke").closest("button")!;
    expect(invokeBtn).not.toBeDisabled();
  });

  // ── Invoke action ──────────────────────────────────────────

  it("calls onInvoke with harness, model, and trimmed prompt", async () => {
    const onInvoke = vi.fn();
    const onClose = vi.fn();
    renderDialog({ onInvoke, onClose });

    const textarea = screen.getByPlaceholderText("Describe the task...");
    await userEvent.type(textarea, "  Fix the bug  ");

    fireEvent.click(screen.getByText("Invoke"));

    expect(onInvoke).toHaveBeenCalledWith("claude", "claude-sonnet-4-6", "Fix the bug");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not invoke when prompt is whitespace only", async () => {
    const onInvoke = vi.fn();
    renderDialog({ onInvoke });

    const textarea = screen.getByPlaceholderText("Describe the task...");
    await userEvent.type(textarea, "   ");

    fireEvent.click(screen.getByText("Invoke"));
    expect(onInvoke).not.toHaveBeenCalled();
  });

  // ── Close actions ──────────────────────────────────────────

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    // The backdrop is the outermost portal element (position: fixed with inset: 0)
    // The card has stopPropagation, so clicking outside the card fires onClose
    const title = screen.getByText("Invoke in Terminal 1");
    // Walk up: title → header → card → backdrop
    const card = title.closest("div[style]")!.parentElement!;
    const backdrop = card.parentElement!;
    fireEvent.pointerDown(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  // ── Keyboard shortcut ──────────────────────────────────────

  it("submits on Cmd+Enter when valid", async () => {
    const onInvoke = vi.fn();
    renderDialog({ onInvoke });

    const textarea = screen.getByPlaceholderText("Describe the task...");
    await userEvent.type(textarea, "Do the thing");

    fireEvent.keyDown(document, { key: "Enter", metaKey: true });

    expect(onInvoke).toHaveBeenCalledWith("claude", "claude-sonnet-4-6", "Do the thing");
  });

  // ── Empty harnesses ────────────────────────────────────────

  it("shows placeholder when no harnesses available", () => {
    renderDialog({ harnesses: [] });
    expect(screen.getByText("No harnesses detected")).toBeInTheDocument();
  });

  it("shows unauthenticated indicator", () => {
    const unauthed = { ...claude, authenticated: false };
    renderDialog({ harnesses: [unauthed] });
    expect(screen.getByText("Claude Code (not authenticated)")).toBeInTheDocument();
  });

  // ── State reset on reopen ──────────────────────────────────

  it("resets prompt when dialog reopens", async () => {
    const { rerender } = renderDialog();

    const textarea = screen.getByPlaceholderText("Describe the task...");
    await userEvent.type(textarea, "old prompt");

    // Close and reopen
    rerender(
      <InvokeDialog {...defaults} open={false} />,
    );
    rerender(
      <InvokeDialog {...defaults} open={true} />,
    );

    const newTextarea = screen.getByPlaceholderText("Describe the task...") as HTMLTextAreaElement;
    expect(newTextarea.value).toBe("");
  });
});
