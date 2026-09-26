import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOAST_TIMEOUT_MS, ToastProvider, useToast } from "../ToastProvider";

function Pusher({
  title = "Copied github to Codex",
  variant = "success",
}: {
  title?: string;
  variant?: "success" | "warning";
}) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast({ title, variant })}>
      push
    </button>
  );
}

describe("ToastProvider", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows a pushed toast and dismisses it after the timeout", () => {
    render(
      <ToastProvider>
        <Pusher />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "push" }));
    expect(screen.getByRole("status")).toHaveTextContent("Copied github to Codex");

    act(() => vi.advanceTimersByTime(TOAST_TIMEOUT_MS - 1));
    expect(screen.queryByRole("status")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps a warning until it is dismissed", () => {
    render(
      <ToastProvider>
        <Pusher variant="warning" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "push" }));
    act(() => vi.advanceTimersByTime(TOAST_TIMEOUT_MS * 3));
    expect(screen.getByRole("status")).toHaveTextContent("Copied github to Codex");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("dismisses on the close button", () => {
    render(
      <ToastProvider>
        <Pusher />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "push" }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
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
    expect(screen.getAllByRole("status")).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Dismiss notification" })[0]);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("second");
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
    const shown = screen.getAllByRole("status").map((toast) => toast.textContent);
    expect(shown).toEqual(["two", "three", "four"]);
  });

  it("is a no-op outside a provider", () => {
    render(<Pusher />);
    expect(() => fireEvent.click(screen.getByRole("button", { name: "push" }))).not.toThrow();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
