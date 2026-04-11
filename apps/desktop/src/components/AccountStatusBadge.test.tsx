import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AccountStatusBadge from "./AccountStatusBadge";

describe("AccountStatusBadge", () => {
  it("renders loading skeleton when loading is true", () => {
    render(<AccountStatusBadge account={null} monthlyTokens={0} loading />);
    expect(screen.getByTestId("account-badge-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("account-status-badge")).not.toBeInTheDocument();
  });

  it("shows 'Not logged in' when account.logged_in is false", () => {
    render(<AccountStatusBadge account={{ logged_in: false }} monthlyTokens={0} />);
    expect(screen.getByTestId("account-not-logged-in")).toBeInTheDocument();
    expect(screen.queryByTestId("account-connected-dot")).not.toBeInTheDocument();
  });

  it("shows 'Not logged in' when account is null", () => {
    render(<AccountStatusBadge account={null} monthlyTokens={0} />);
    expect(screen.getByTestId("account-not-logged-in")).toBeInTheDocument();
  });

  it("shows connected state when logged_in is true", () => {
    render(<AccountStatusBadge account={{ logged_in: true }} monthlyTokens={142_000} />);
    expect(screen.getByTestId("account-connected-dot")).toBeInTheDocument();
    expect(screen.getByTestId("account-connected-label")).toBeInTheDocument();
    expect(screen.queryByTestId("account-not-logged-in")).not.toBeInTheDocument();
  });

  it("formats token count in thousands (k)", () => {
    render(<AccountStatusBadge account={{ logged_in: true }} monthlyTokens={142_000} />);
    expect(screen.getByTestId("account-token-count").textContent).toContain("142k");
  });

  it("formats token count in millions (M)", () => {
    render(<AccountStatusBadge account={{ logged_in: true }} monthlyTokens={1_200_000} />);
    expect(screen.getByTestId("account-token-count").textContent).toContain("1.2M");
  });

  it("formats small token counts as plain numbers", () => {
    render(<AccountStatusBadge account={{ logged_in: true }} monthlyTokens={500} />);
    expect(screen.getByTestId("account-token-count").textContent).toContain("500");
  });

  it("shows zero tokens when monthlyTokens is 0 and connected", () => {
    render(<AccountStatusBadge account={{ logged_in: true }} monthlyTokens={0} />);
    expect(screen.getByTestId("account-token-count").textContent).toContain("0");
  });
});
