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
});
