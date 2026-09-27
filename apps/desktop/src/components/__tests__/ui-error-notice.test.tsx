import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorNotice } from "@harness-kit/ui";

// AC-20: what failed, one action, the raw error behind "Details".
describe("@harness-kit/ui ErrorNotice", () => {
  it("announces the title, not the details, as an alert", () => {
    render(<ErrorNotice title="Couldn't scan this machine" details="EACCES: permission denied" />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Couldn't scan this machine");
    // Details sit outside the atomic live region, so opening them does not
    // re-announce the notice.
    expect(within(alert).queryByText(/EACCES/)).toBeNull();
  });

  it("keeps the raw error hidden until Details is opened", async () => {
    const user = userEvent.setup();
    render(<ErrorNotice title="Couldn't load plugins" details="EACCES: permission denied" />);
    expect(screen.getByText("EACCES: permission denied")).not.toBeVisible();
    await user.click(screen.getByText("Details"));
    expect(screen.getByText("EACCES: permission denied")).toBeVisible();
  });

  it("renders one action that calls onClick", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ErrorNotice title="Couldn't load plugins" action={{ label: "Retry", onClick }} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("has no action and no disclosure when none are given", () => {
    render(<ErrorNotice title="Couldn't load plugins" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("Details")).toBeNull();
  });

  it("uses a status region for the warning tone", () => {
    render(<ErrorNotice tone="warning" title="Showing machine-only results" />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Showing machine-only results");
  });
});
