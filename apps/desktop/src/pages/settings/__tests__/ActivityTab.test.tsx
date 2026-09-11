import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityTab } from "../ActivityTab";
import type { DesktopPortabilitySnapshot } from "../../fleet/portability-data";

// ── Mocks ─────────────────────────────────────────────────────

vi.mock("@tauri-apps/api/path", () => ({
  homeDir: vi.fn(() => Promise.resolve("/home/user")),
}));

const snapshot: DesktopPortabilitySnapshot = {
  generatedAt: "2026-08-28T12:00:00.000Z",
  layers: [{ scope: "personal", source: "/Users/dev/.harness/harness.yaml", resources: 3 }],
  conflicts: [],
  operations: [],
  lossCount: 2,
  capabilityTotals: { native: 40, translated: 20, "source-only": 12, unsupported: 8, "not-applicable": 2 },
  capturePreview: { resources: 7, targets: 8 },
  applyPreview: { createsOrUpdates: 5, captures: 1, deletions: 0 },
  rollbackHistory: ["2026-08-28T11-55-00Z"],
  lastAppliedAt: "2026-08-28T11:55:00.000Z",
  inventory: {
    version: 1,
    installationId: "desktop-1",
    capturedAt: "2026-08-28T12:00:00.000Z",
    targets: ["claude-code", "codex"],
    effectiveConfig: {},
    assignments: [],
    drift: [],
    redactions: [],
  },
  rollout: { status: "not-enrolled", detail: "Enroll this device to receive assignments." },
};

const mockBuildDesktopPortabilitySnapshot = vi.fn();

vi.mock("../../fleet/portability-data", () => ({
  buildDesktopPortabilitySnapshot: (...args: unknown[]) => mockBuildDesktopPortabilitySnapshot(...args),
}));

const mockListAuditEntries = vi.fn();
const mockGrantProjectScope = vi.fn();

vi.mock("../../../lib/tauri", () => ({
  listAuditEntries: (...args: unknown[]) => mockListAuditEntries(...args),
  clearAuditEntries: vi.fn(),
  grantProjectScope: (...args: unknown[]) => mockGrantProjectScope(...args),
}));

// ── Tests ────────────────────────────────────────────────────

describe("ActivityTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockListAuditEntries.mockResolvedValue([]);
    mockBuildDesktopPortabilitySnapshot.mockResolvedValue(snapshot);
  });

  it("renders both the audit log and the reconciliation ledger", async () => {
    render(<ActivityTab />);

    expect(await screen.findByText("Audit Log")).toBeInTheDocument();
    expect(await screen.findByText("Reconciliation ledger")).toBeInTheDocument();
  });

  it("does not grant project scope when no project is tracked", async () => {
    render(<ActivityTab />);
    await screen.findByText("Reconciliation ledger");
    expect(mockGrantProjectScope).not.toHaveBeenCalled();
  });

  it("shows a degraded notice when a project is tracked but its scope grant fails", async () => {
    localStorage.setItem("harness-kit-sync-recent-dirs", JSON.stringify(["/repo/gone"]));
    mockGrantProjectScope.mockRejectedValue(new Error("forbidden"));

    render(<ActivityTab />);

    // The ledger still renders machine-only (personal-scope) results — a
    // failed grant drops the project layer rather than failing the ledger.
    await screen.findByText("Reconciliation ledger");
    expect(await screen.findByTestId("project-degraded-notice")).toHaveTextContent(
      "Project directory could not be scanned — showing personal-scope results only.",
    );
    expect(mockGrantProjectScope).toHaveBeenCalledWith("/repo/gone");
    expect(mockBuildDesktopPortabilitySnapshot).toHaveBeenCalledWith("/home/user", null, expect.any(String));
  });

  it("shows an error notice when the snapshot build itself fails outright", async () => {
    mockBuildDesktopPortabilitySnapshot.mockRejectedValue(new Error("boom"));

    render(<ActivityTab />);

    expect(await screen.findByText(/Ledger failed to build: Error: boom/)).toBeInTheDocument();
    expect(screen.queryByTestId("project-degraded-notice")).not.toBeInTheDocument();
    expect(screen.queryByText("Reconciliation ledger")).not.toBeInTheDocument();
  });
});
