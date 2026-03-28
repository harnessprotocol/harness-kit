import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import HarnessSelector from "../HarnessSelector";
import type { HarnessInfo } from "@harness-kit/shared";

const makeHarness = (id: string, available = true): HarnessInfo => ({
  id,
  name: id === "claude" ? "Claude Code" : id === "gh-copilot" ? "GitHub Copilot" : id,
  command: id,
  available,
  version: available ? "1.0.0" : undefined,
  mode: available ? "supported" : undefined,
  authenticated: available,
  models: available ? ["claude-sonnet-4-6", "gpt-4o"] : [],
  defaultModel: available ? "claude-sonnet-4-6" : undefined,
});

const harnesses: HarnessInfo[] = [
  makeHarness("claude"),
  makeHarness("gh-copilot"),
  makeHarness("cursor", false),
];

describe("HarnessSelector", () => {
  it("renders all harnesses", () => {
    render(
      <HarnessSelector harnesses={harnesses} selected={[]} onToggle={vi.fn()} onModelChange={vi.fn()} />
    );
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("GitHub Copilot")).toBeInTheDocument();
    expect(screen.getByText("cursor")).toBeInTheDocument();
  });

  it("shows Not found badge for unavailable harness", () => {
    render(
      <HarnessSelector harnesses={harnesses} selected={[]} onToggle={vi.fn()} onModelChange={vi.fn()} />
    );
    expect(screen.getByText("Not found")).toBeInTheDocument();
  });

  it("calls onToggle when an available harness is clicked", () => {
    const onToggle = vi.fn();
    render(
      <HarnessSelector harnesses={harnesses} selected={[]} onToggle={onToggle} onModelChange={vi.fn()} />
    );
    fireEvent.click(screen.getByText("Claude Code"));
    expect(onToggle).toHaveBeenCalledWith("claude");
  });

  it("does not call onToggle for unavailable harness", () => {
    const onToggle = vi.fn();
    render(
      <HarnessSelector harnesses={harnesses} selected={[]} onToggle={onToggle} onModelChange={vi.fn()} />
    );
    fireEvent.click(screen.getByText("cursor"));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("shows model selector for selected harness", () => {
    const selected = [{ harnessId: "claude", model: "claude-sonnet-4-6" }];
    render(
      <HarnessSelector harnesses={harnesses} selected={selected} onToggle={vi.fn()} onModelChange={vi.fn()} />
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("calls onModelChange when model is changed", () => {
    const onModelChange = vi.fn();
    const selected = [{ harnessId: "claude", model: "claude-sonnet-4-6" }];
    render(
      <HarnessSelector harnesses={harnesses} selected={selected} onToggle={vi.fn()} onModelChange={onModelChange} />
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "gpt-4o" } });
    expect(onModelChange).toHaveBeenCalledWith("claude", "gpt-4o");
  });

  it("shows Login required badge for unauthenticated harness", () => {
    const unauthed: HarnessInfo[] = [
      { id: "claude", name: "Claude Code", command: "claude", available: true, authenticated: false, models: [], version: "1.0.0", mode: "supported" },
    ];
    render(
      <HarnessSelector harnesses={unauthed} selected={[]} onToggle={vi.fn()} onModelChange={vi.fn()} />
    );
    expect(screen.getByText("Login required")).toBeInTheDocument();
  });

  it("does not call onToggle for unauthenticated harness", () => {
    const onToggle = vi.fn();
    const unauthed: HarnessInfo[] = [
      { id: "claude", name: "Claude Code", command: "claude", available: true, authenticated: false, models: [], version: "1.0.0", mode: "supported" },
    ];
    render(
      <HarnessSelector harnesses={unauthed} selected={[]} onToggle={onToggle} onModelChange={vi.fn()} />
    );
    fireEvent.click(screen.getByText("Claude Code"));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("shows login command for unauthenticated harness", () => {
    const unauthed: HarnessInfo[] = [
      { id: "claude", name: "Claude Code", command: "claude", available: true, authenticated: false, models: [], version: "1.0.0", mode: "supported" },
    ];
    render(
      <HarnessSelector harnesses={unauthed} selected={[]} onToggle={vi.fn()} onModelChange={vi.fn()} />
    );
    expect(screen.getByText("claude login")).toBeInTheDocument();
  });

  it("blocks toggle when 4 harnesses already selected", () => {
    const onToggle = vi.fn();
    const fourSelected = [
      { harnessId: "claude", model: "claude-sonnet-4-6" },
      { harnessId: "gh-copilot", model: "gpt-4o" },
      { harnessId: "cursor", model: "gpt-4o" },
      { harnessId: "extra", model: "x" },
    ];
    // Add a 5th available harness
    const extended = [...harnesses, makeHarness("another")];
    render(
      <HarnessSelector harnesses={extended} selected={fourSelected} onToggle={onToggle} onModelChange={vi.fn()} />
    );
    fireEvent.click(screen.getByText("another"));
    expect(onToggle).not.toHaveBeenCalled();
  });
});
