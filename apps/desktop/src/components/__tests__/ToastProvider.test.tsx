import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOAST_TIMEOUT_MS, ToastProvider, useToast } from "../ToastProvider";

function Pusher({
  title = "Copied github to Codex",
  variant = "success",
}: {
  title?: string;
  variant?: "success" | "warning" | "danger";
}) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast({ title, variant })}>
      push
    </button>
  );
}

// The one live region (AC-61): always mounted, toasts appear inside it.
const region = () => screen.getByRole("log", { name: "Notifications" });
const shownToasts = () => Array.from(region().querySelectorAll(".hk-toast")).map((t) => t.textContent);

describe("ToastProvider", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("mounts the live region before any toast, so the first message is announced", () => {
    render(
      <ToastProvider>
        <Pusher />
      </ToastProvider>,
    );
    expect(region()).toBeInTheDocument();
    expect(shownToasts()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "push" }));
    // The same node: the region was not created by the toast.
    expect(region()).toHaveTextContent("Copied github to Codex");
  });

  it("gives a danger toast role=alert and the others no role of their own", () => {
    render(
      <ToastProvider>
        <Pusher variant="danger" />
        <Pusher variant="success" title="fine" />
      </ToastProvider>,
    );
    const [danger, ok] = screen.getAllByRole("button", { name: "push" });
    fireEvent.click(danger);
    fireEvent.click(ok);
    expect(screen.getByRole("alert")).toHaveTextContent("Copied github to Codex");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows a pushed toast and dismisses it after the timeout", () => {
    render(
      <ToastProvider>
        <Pusher />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "push" }));
    expect(region()).toHaveTextContent("Copied github to Codex");

    act(() => vi.advanceTimersByTime(TOAST_TIMEOUT_MS - 1));
    expect(shownToasts()).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(shownToasts()).toHaveLength(0);
  });

  it("keeps a warning until it is dismissed", () => {
    render(
      <ToastProvider>
        <Pusher variant="warning" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "push" }));
    act(() => vi.advanceTimersByTime(TOAST_TIMEOUT_MS * 3));
    expect(region()).toHaveTextContent("Copied github to Codex");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(shownToasts()).toHaveLength(0);
  });

  it("dismisses on the close button", () => {
    render(
      <ToastProvider>
        <Pusher />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "push" }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(shownToasts()).toHaveLength(0);
  });

  it("gives each toast its own id, so dismissing one keeps the other", () => {
    render(
      <ToastProvider>
        <Pusher title="first" />
        <Pusher title="second" />
      </ToastProvider>,
    );
    const [first, second] = screen.getAllByRole("button", { name: "push" });
    fireEvent.click(first);
    fireEvent.click(second);
    expect(shownToasts()).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Dismiss notification" })[0]);
    expect(shownToasts()).toEqual(["second"]);
  });

  it("shows the newest three when more are stacked", () => {
    render(
      <ToastProvider>
        {["one", "two", "three", "four"].map((title) => (
          <Pusher key={title} title={title} variant="warning" />
        ))}
      </ToastProvider>,
    );
    for (const button of screen.getAllByRole("button", { name: "push" })) fireEvent.click(button);
    expect(shownToasts()).toEqual(["two", "three", "four"]);
  });

  it("is a no-op outside a provider", () => {
    render(<Pusher />);
    expect(() => fireEvent.click(screen.getByRole("button", { name: "push" }))).not.toThrow();
    expect(screen.queryByRole("log")).not.toBeInTheDocument();
  });
});
