import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PortabilityPanel } from "../PortabilityPanel";
import type { DesktopPortabilitySnapshot } from "../portability-data";

const snapshot: DesktopPortabilitySnapshot = {
  generatedAt: "2026-08-28T12:00:00.000Z",
  layers: [
    { scope: "personal", source: "/Users/dev/.harness/harness.yaml", resources: 3 },
    { scope: "project", source: "/repo/harness.yaml", resources: 4 },
  ],
  conflicts: [],
  operations: [],
  lossCount: 2,
  capabilityTotals: { native: 40, translated: 20, "source-only": 12, unsupported: 8 },
  capturePreview: { resources: 7, targets: 8 },
  applyPreview: { createsOrUpdates: 5, captures: 1, deletions: 0 },
  rollbackHistory: ["2026-08-28T11-55-00Z"],
  lastAppliedAt: "2026-08-28T11:55:00.000Z",
  rollout: { status: "not-enrolled", detail: "Enroll this device to receive assignments." },
};

describe("PortabilityPanel", () => {
  it("shows layered apply and capture previews without mutating state", () => {
    render(<PortabilityPanel snapshot={snapshot} />);
    expect(screen.getByText("personal → project")).toBeInTheDocument();
    expect(screen.getByText("native changes ready")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "capture" }));
    expect(screen.getByText("resources discovered")).toBeInTheDocument();
    expect(screen.getByText(/8 target harnesses/i)).toBeInTheDocument();
  });

  it("exposes all capability classifications", () => {
    render(<PortabilityPanel snapshot={snapshot} />);
    fireEvent.click(screen.getByRole("tab", { name: "capabilities" }));
    expect(screen.getByText("native")).toBeInTheDocument();
    expect(screen.getByText("translated")).toBeInTheDocument();
    expect(screen.getByText("source-only")).toBeInTheDocument();
    expect(screen.getByText("unsupported")).toBeInTheDocument();
  });
});
