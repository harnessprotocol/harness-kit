import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CostBreakdownSection from "../CostBreakdownSection";

describe("CostBreakdownSection", () => {
  it("renders a cost row for each model with usage", () => {
    render(
      <CostBreakdownSection
        modelUsage={{
          "claude-sonnet-4-6": { inputTokens: 100_000, outputTokens: 10_000 },
          "claude-haiku-4-5":  { inputTokens: 50_000,  outputTokens: 5_000  },
        }}
      />
    );

    const rows = screen.getAllByTestId("cost-row");
    expect(rows).toHaveLength(2);
  });

  it("sorts rows by cost descending", () => {
    render(
      <CostBreakdownSection
        modelUsage={{
          "claude-haiku-4-5":  { inputTokens: 1_000_000, outputTokens: 1_000_000 },
          "claude-sonnet-4-6": { inputTokens: 1_000_000, outputTokens: 1_000_000 },
        }}
      />
    );

    const rows = screen.getAllByTestId("cost-row");
    // sonnet ($18) should appear before haiku ($4.80)
    expect(rows[0].textContent).toContain("sonnet");
    expect(rows[1].textContent).toContain("haiku");
  });

  it("shows empty state when no usage data", () => {
    render(<CostBreakdownSection modelUsage={{}} />);
    expect(screen.getByText(/No token usage data/)).toBeInTheDocument();
  });

  it("excludes models with zero tokens from the table", () => {
    render(
      <CostBreakdownSection
        modelUsage={{
          "claude-sonnet-4-6": { inputTokens: 0, outputTokens: 0 },
          "claude-haiku-4-5":  { inputTokens: 100, outputTokens: 0 },
        }}
      />
    );

    const rows = screen.getAllByTestId("cost-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("haiku");
  });

  it("renders correct cost for sonnet usage", () => {
    // 1M input + 0 output = $3.00
    render(
      <CostBreakdownSection
        modelUsage={{
          "claude-sonnet-4-6": { inputTokens: 1_000_000, outputTokens: 0 },
        }}
      />
    );

    expect(screen.getByText("$3.00")).toBeInTheDocument();
  });
});
