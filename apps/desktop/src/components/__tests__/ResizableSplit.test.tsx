import { describe, it, expect, afterEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ResizableSplit from "../ResizableSplit";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

function renderSplit(containerWidth: number) {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(containerWidth);
  render(
    <ResizableSplit
      left={<div>left</div>}
      right={<div>right</div>}
      defaultWidth={560}
      minWidth={320}
      maxWidth={1400}
      minRightWidth={360}
      handleLabel="Resize"
    />,
  );
  return screen.getByRole("separator", { name: "Resize" });
}

describe("ResizableSplit", () => {
  it("arrow keys never grow the left panel past what the right panel's minimum leaves", () => {
    const handle = renderSplit(1000); // room for 640 on the left
    for (let i = 0; i < 20; i++) fireEvent.keyDown(handle, { key: "ArrowRight", shiftKey: true });
    expect(handle).toHaveAttribute("aria-valuenow", "640");
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    // One step back moves it, instead of first burning steps on an unseen overshoot.
    expect(handle).toHaveAttribute("aria-valuenow", "624");
  });

  it("End goes to the widest the container allows", () => {
    const handle = renderSplit(1000);
    fireEvent.keyDown(handle, { key: "End" });
    expect(handle).toHaveAttribute("aria-valuenow", "640");
  });

  it("still stops at maxWidth in a wide container", () => {
    const handle = renderSplit(3000);
    fireEvent.keyDown(handle, { key: "End" });
    expect(handle).toHaveAttribute("aria-valuenow", "1400");
  });
});
