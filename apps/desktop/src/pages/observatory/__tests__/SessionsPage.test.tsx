import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { SessionSummary, SessionFacet } from "@harness-kit/shared";
import SessionsPage from "../SessionsPage";

// ── Tauri mock ────────────────────────────────────────────────
// Variable names must start with "mock" for Vitest hoisting to allow
// access inside the vi.mock factory.

let mockListSessionsSummary: () => Promise<unknown>;
let mockReadSessionFacet: (sessionId: string) => Promise<unknown>;
let mockReadSessionTranscript: (sessionId: string, project: string) => Promise<unknown>;

vi.mock("../../../lib/tauri", () => ({
  get listSessionsSummary() { return mockListSessionsSummary; },
  get readSessionFacet() { return mockReadSessionFacet; },
  get readSessionTranscript() { return mockReadSessionTranscript; },
}));

// ── Fixtures ──────────────────────────────────────────────────

const mockSessions: SessionSummary[] = [
  {
    sessionId: "sess-1",
    project: "/Users/john/repos/my-project",
    projectShort: "my-project",
    firstTimestamp: 1741824600000,  // 2026-03-13 06:50 UTC
    lastTimestamp: 1741824600000 + 2 * 3_600_000 + 15 * 60_000,
    messageCount: 142,
  },
  {
    sessionId: "sess-2",
    project: "/Users/john/repos/other-app",
    projectShort: "other-app",
    firstTimestamp: 1741738200000,
    lastTimestamp: 1741738200000 + 45 * 60_000,
    messageCount: 23,
  },
];

const mockFacet: SessionFacet = {
  session_id: "sess-1",
  underlying_goal: "Add Observatory dashboard",
  outcome: "fully_achieved",
  claude_helpfulness: "very_helpful",
  session_type: "feature_development",
  brief_summary: "Built the Observatory feature with charts.",
  friction_counts: null,
};

// ── Render helper ─────────────────────────────────────────────

function renderSessions() {
  return render(
    <MemoryRouter>
      <SessionsPage />
    </MemoryRouter>,
  );
}

// ── Setup ─────────────────────────────────────────────────────

beforeEach(() => {
  // Default: facet and transcript return null unless overridden per test
  mockReadSessionFacet = () => Promise.resolve(null);
  mockReadSessionTranscript = () => Promise.resolve({ sessionId: "", entries: [], totalInputTokens: 0, totalOutputTokens: 0, totalToolCalls: 0, modelsUsed: [], subagentCount: 0, truncated: false });
});

// ── Tests ─────────────────────────────────────────────────────

describe("SessionsPage — loading state", () => {
  it("shows 'Loading…' before data arrives", () => {
    mockListSessionsSummary = () => new Promise(() => {});
    renderSessions();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("hides 'Loading…' after data loads", async () => {
    mockListSessionsSummary = () => Promise.resolve(mockSessions);
    renderSessions();
    await waitFor(() =>
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument(),
    );
  });
});

describe("SessionsPage — session list", () => {
  beforeEach(() => {
    mockListSessionsSummary = () => Promise.resolve(mockSessions);
  });

  it("renders both sessions after load", async () => {
    renderSessions();
    expect(await screen.findByText("my-project")).toBeInTheDocument();
    expect(screen.getByText("other-app")).toBeInTheDocument();
  });

  it("shows correct message count for first session", async () => {
    renderSessions();
    expect(await screen.findByText("142 msgs")).toBeInTheDocument();
  });

  it("shows message count for second session", async () => {
    renderSessions();
    expect(await screen.findByText("23 msgs")).toBeInTheDocument();
  });
});

describe("SessionsPage — empty state", () => {
  it("shows 'No sessions found.' when list is empty", async () => {
    mockListSessionsSummary = () => Promise.resolve([]);
    renderSessions();
    expect(await screen.findByText("No sessions found.")).toBeInTheDocument();
  });
});

describe("SessionsPage — session count header", () => {
  it("shows '2 sessions across 2 projects'", async () => {
    mockListSessionsSummary = () => Promise.resolve(mockSessions);
    renderSessions();
    expect(
      await screen.findByText("2 sessions across 2 projects"),
    ).toBeInTheDocument();
  });
});

describe("SessionsPage — row click / facet", () => {
  beforeEach(() => {
    mockListSessionsSummary = () => Promise.resolve(mockSessions);
  });

  it("calls readSessionFacet with the correct session ID on row click", async () => {
    const readFacetSpy = vi.fn().mockResolvedValue(null);
    mockReadSessionFacet = readFacetSpy;

    renderSessions();
    const projectPill = await screen.findByText("my-project");
    // The pill is inside a <button>; click the ancestor button
    const rowButton = projectPill.closest("button")!;
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(readFacetSpy).toHaveBeenCalledWith("sess-1");
    });
  });

  it("shows 'fully achieved' outcome badge after clicking row and facet loads", async () => {
    mockReadSessionFacet = () => Promise.resolve(mockFacet);

    renderSessions();
    const projectPill = await screen.findByText("my-project");
    const rowButton = projectPill.closest("button")!;
    fireEvent.click(rowButton);

    expect(await screen.findByText("fully achieved")).toBeInTheDocument();
  });

  it("shows 'No insights available' when facet is null", async () => {
    mockReadSessionFacet = () => Promise.resolve(null);

    renderSessions();
    const projectPill = await screen.findByText("my-project");
    const rowButton = projectPill.closest("button")!;
    fireEvent.click(rowButton);

    expect(
      await screen.findByText("No transcript or insights available for this session."),
    ).toBeInTheDocument();
  });
});

describe("SessionsPage — error state", () => {
  it("shows error message when listSessionsSummary rejects", async () => {
    mockListSessionsSummary = () => Promise.reject(new Error("Failed to list sessions"));
    renderSessions();
    expect(await screen.findByText(/Failed to list sessions/)).toBeInTheDocument();
  });

  it("does not show loading spinner after error", async () => {
    mockListSessionsSummary = () => Promise.reject(new Error("Error"));
    renderSessions();
    await screen.findByText(/Error/);
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });
});
