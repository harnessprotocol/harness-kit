import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { lazy } from "react";
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

  it("catches render errors and shows a notice with Reload page, raw error behind Details (AC-20)", async () => {
    const user = userEvent.setup();
    render(<PageBoundary><Bomb shouldThrow /></PageBoundary>);
    expect(screen.getByTestId("page-boundary-error")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("This page hit an error");
    expect(screen.getByRole("button", { name: "Reload page" })).toBeInTheDocument();
    expect(screen.getByText("test explosion")).not.toBeVisible();
    await user.click(screen.getByText("Details"));
    expect(screen.getByText("test explosion")).toBeVisible();
  });

  it("Reload page resets the boundary", async () => {
    const user = userEvent.setup();
    let shouldThrow = true;
    function DynamicBomb() {
      if (shouldThrow) throw new Error("test explosion");
      return <div>Safe content</div>;
    }
    render(<PageBoundary><DynamicBomb /></PageBoundary>);
    expect(screen.getByTestId("page-boundary-error")).toBeInTheDocument();

    // Simulate the underlying problem resolving, then the user reloads the page
    shouldThrow = false;
    await user.click(screen.getByRole("button", { name: "Reload page" }));
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

  describe("a page chunk that failed to load", () => {
    let reload: ReturnType<typeof vi.fn>;
    beforeEach(() => {
      reload = vi.fn();
      vi.stubGlobal("location", { ...window.location, reload });
    });
    afterEach(() => { vi.unstubAllGlobals(); });

    it.each([
      "Failed to fetch dynamically imported module: http://localhost:1422/src/pages/Foo.tsx",
      "Importing a module script failed.",
      "error loading dynamically imported module: http://localhost:1422/src/pages/Foo.tsx",
    ])("Reload page reloads the window for %s", async (message) => {
      const user = userEvent.setup();
      // React.lazy caches the rejection: resetting the boundary alone re-throws.
      const Page = lazy(() => Promise.reject(new TypeError(message)));
      render(<PageBoundary><Page /></PageBoundary>);
      expect(await screen.findByRole("alert")).toHaveTextContent("This page hit an error");

      await user.click(screen.getByRole("button", { name: "Reload page" }));
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it("a render error resets the boundary without reloading the window", async () => {
      const user = userEvent.setup();
      let shouldThrow = true;
      function DynamicBomb() {
        if (shouldThrow) throw new Error("test explosion");
        return <div>Safe content</div>;
      }
      render(<PageBoundary><DynamicBomb /></PageBoundary>);
      shouldThrow = false;
      await user.click(screen.getByRole("button", { name: "Reload page" }));
      expect(screen.getByText("Safe content")).toBeInTheDocument();
      expect(reload).not.toHaveBeenCalled();
    });
  });
});
