import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RecommendationsPanel, { TaskTypeSelector } from "./RecommendationsPanel";
import type { HarnessRecommendation } from "@harness-kit/shared";

const mockRecs: HarnessRecommendation[] = [
  { harnessId: "claude",  harnessName: "Claude Code", taskType: "coding", winRate: 0.8,  sessionCount: 10 },
  { harnessId: "codex",   harnessName: "Codex CLI",   taskType: "coding", winRate: 0.55, sessionCount: 6  },
  { harnessId: "opencode",harnessName: "OpenCode",    taskType: "coding", winRate: 0.4,  sessionCount: 5  },
];

describe("RecommendationsPanel", () => {
  it("renders nothing when taskType is null", () => {
    const { container } = render(
      <RecommendationsPanel taskType={null} recommendations={[]} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows empty state when no recommendations", () => {
    render(<RecommendationsPanel taskType="coding" recommendations={[]} />);
    expect(screen.getByTestId("recommendations-empty")).toBeInTheDocument();
    expect(screen.getByText(/Run 3\+ comparisons/)).toBeInTheDocument();
  });

  it("renders top harness recommendation", () => {
    render(<RecommendationsPanel taskType="coding" recommendations={mockRecs} />);
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
  });

  it("renders win rate bars for all top-3 harnesses", () => {
    render(<RecommendationsPanel taskType="coding" recommendations={mockRecs} />);
    const rows = screen.getAllByTestId("recommendation-row");
    expect(rows).toHaveLength(3);
  });

  it("shows only top 3 even when more recommendations are provided", () => {
    const extended: HarnessRecommendation[] = [
      ...mockRecs,
      { harnessId: "gemini", harnessName: "Gemini CLI", taskType: "coding", winRate: 0.3, sessionCount: 4 },
    ];
    render(<RecommendationsPanel taskType="coding" recommendations={extended} />);
    const rows = screen.getAllByTestId("recommendation-row");
    expect(rows).toHaveLength(3);
  });

  it("shows session count for each recommendation", () => {
    render(<RecommendationsPanel taskType="coding" recommendations={mockRecs} />);
    expect(screen.getByText("10 sessions")).toBeInTheDocument();
  });

  it("renders panel with correct task label in empty state", () => {
    render(<RecommendationsPanel taskType="debugging" recommendations={[]} />);
    expect(screen.getByTestId("recommendations-empty").textContent).toContain("Debugging");
  });
});

describe("TaskTypeSelector", () => {
  it("renders all 6 task type pills", () => {
    const onChange = vi.fn();
    render(<TaskTypeSelector selected={null} onChange={onChange} />);
    expect(screen.getByTestId("task-type-pill-coding")).toBeInTheDocument();
    expect(screen.getByTestId("task-type-pill-debugging")).toBeInTheDocument();
    expect(screen.getByTestId("task-type-pill-documentation")).toBeInTheDocument();
  });

  it("calls onChange with the selected type on click", () => {
    const onChange = vi.fn();
    render(<TaskTypeSelector selected={null} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("task-type-pill-coding"));
    expect(onChange).toHaveBeenCalledWith("coding");
  });

  it("calls onChange with null when clicking the already-selected type (deselect)", () => {
    const onChange = vi.fn();
    render(<TaskTypeSelector selected="coding" onChange={onChange} />);
    fireEvent.click(screen.getByTestId("task-type-pill-coding"));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
