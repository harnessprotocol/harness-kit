import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BudgetAlertBanner from "../BudgetAlertBanner";

describe("BudgetAlertBanner", () => {
  it("renders when tokens exceed limit", () => {
    render(
      <BudgetAlertBanner
        tokensToday={600_000}
        tokenLimit={500_000}
        costToday={0}
      />
    );
    expect(screen.getByTestId("budget-alert-banner")).toBeInTheDocument();
    expect(screen.getByText(/Daily budget exceeded/)).toBeInTheDocument();
  });

  it("renders when cost exceeds limit", () => {
    render(
      <BudgetAlertBanner
        tokensToday={0}
        costToday={6.50}
        costLimit={5.00}
      />
    );
    expect(screen.getByTestId("budget-alert-banner")).toBeInTheDocument();
  });

  it("does not render when within token limit", () => {
    render(
      <BudgetAlertBanner
        tokensToday={100_000}
        tokenLimit={500_000}
        costToday={0.30}
      />
    );
    expect(screen.queryByTestId("budget-alert-banner")).not.toBeInTheDocument();
  });

  it("does not render when no limits are set", () => {
    render(
      <BudgetAlertBanner
        tokensToday={1_000_000}
        costToday={18.00}
      />
    );
    expect(screen.queryByTestId("budget-alert-banner")).not.toBeInTheDocument();
  });

  it("dismiss button hides the banner and calls onDismiss", () => {
    const onDismiss = vi.fn();
    render(
      <BudgetAlertBanner
        tokensToday={600_000}
        tokenLimit={500_000}
        costToday={0}
        onDismiss={onDismiss}
      />
    );

    expect(screen.getByTestId("budget-alert-banner")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("budget-dismiss-btn"));
    expect(screen.queryByTestId("budget-alert-banner")).not.toBeInTheDocument();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("shows both token and cost messages when both are exceeded", () => {
    render(
      <BudgetAlertBanner
        tokensToday={600_000}
        tokenLimit={500_000}
        costToday={6.00}
        costLimit={5.00}
      />
    );

    const banner = screen.getByTestId("budget-alert-banner");
    expect(banner.textContent).toContain("600,000 tokens today");
    expect(banner.textContent).toContain("$6.00 today");
  });
});
