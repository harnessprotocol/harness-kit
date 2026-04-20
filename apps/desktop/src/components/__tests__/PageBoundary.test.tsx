import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PageBoundary } from "../PageBoundary";

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { consoleErrorSpy.mockRestore(); });

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("test explosion");
  return <div>Safe content</div>;
}

describe("PageBoundary", () => {
  it("renders children when no error", () => {
    render(<PageBoundary><Bomb shouldThrow={false} /></PageBoundary>);
    expect(screen.getByText("Safe content")).toBeInTheDocument();
  });

  it("catches render errors and shows error UI", () => {
    render(<PageBoundary><Bomb shouldThrow /></PageBoundary>);
    expect(screen.getByTestId("page-boundary-error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("retry button resets the boundary", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<PageBoundary><Bomb shouldThrow /></PageBoundary>);
    expect(screen.getByTestId("page-boundary-error")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    rerender(<PageBoundary><Bomb shouldThrow={false} /></PageBoundary>);
    expect(screen.getByText("Safe content")).toBeInTheDocument();
  });

  it("resets error state when locationKey changes", () => {
    const { rerender } = render(
      <PageBoundary locationKey="/a"><Bomb shouldThrow /></PageBoundary>
    );
    expect(screen.getByTestId("page-boundary-error")).toBeInTheDocument();

    // Navigate to a different route — locationKey changes → ErrorBoundary remounts
    rerender(<PageBoundary locationKey="/b"><Bomb shouldThrow={false} /></PageBoundary>);
    expect(screen.getByText("Safe content")).toBeInTheDocument();
  });
});
