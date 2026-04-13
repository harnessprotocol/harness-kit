import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../../../lib/board-api";
import BoardProjectsPage from "../BoardProjectsPage";

// ── Mock useBoardServerReady ───────────────────────────────────

let mockUseBoardServerReady: () => { ready: boolean };

vi.mock("../../../hooks/useBoardServerReady", () => ({
  get useBoardServerReady() {
    return mockUseBoardServerReady;
  },
}));

// ── Mock board-api ─────────────────────────────────────────────

let mockProjectsList: () => Promise<Project[]>;

vi.mock("../../../lib/board-api", () => ({
  get api() {
    return { projects: { list: mockProjectsList } };
  },
  BOARD_SERVER_BASE: "http://localhost:4800",
}));

// ── Fixtures ───────────────────────────────────────────────────

const makeProject = (slug: string, name: string): Project => ({
  name,
  slug,
  next_id: 1,
  version: 1,
  epics: [],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

const projectAlpha = makeProject("alpha", "Alpha");
const projectBeta = makeProject("beta", "Beta");

// ── Helpers ────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter>
      <BoardProjectsPage />
    </MemoryRouter>,
  );
}

// ── Setup ──────────────────────────────────────────────────────

beforeEach(() => {
  mockUseBoardServerReady = () => ({ ready: false });
  mockProjectsList = vi.fn().mockResolvedValue([]);
});

// ── Tests ──────────────────────────────────────────────────────

describe("BoardProjectsPage — not ready state", () => {
  it("shows 'Connecting to board server...' when ready=false", () => {
    mockUseBoardServerReady = () => ({ ready: false });
    renderPage();
    expect(screen.getByText("Connecting to board server...")).toBeInTheDocument();
  });

  it("does not call api.projects.list when not ready", () => {
    mockUseBoardServerReady = () => ({ ready: false });
    renderPage();
    expect(mockProjectsList).not.toHaveBeenCalled();
  });
});

describe("BoardProjectsPage — ready with multiple projects", () => {
  beforeEach(() => {
    mockUseBoardServerReady = () => ({ ready: true });
    mockProjectsList = vi.fn().mockResolvedValue([projectAlpha, projectBeta]);
  });

  it("renders project names after API resolves", async () => {
    renderPage();
    expect(await screen.findByText("Alpha")).toBeInTheDocument();
    expect(await screen.findByText("Beta")).toBeInTheDocument();
  });

  it("shows 'Projects' heading", async () => {
    renderPage();
    expect(await screen.findByText("Projects")).toBeInTheDocument();
  });
});

describe("BoardProjectsPage — ready with no projects", () => {
  beforeEach(() => {
    mockUseBoardServerReady = () => ({ ready: true });
    mockProjectsList = vi.fn().mockResolvedValue([]);
  });

  it("shows 'No projects yet' message", async () => {
    renderPage();
    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
  });
});

describe("BoardProjectsPage — ready with API error", () => {
  beforeEach(() => {
    mockUseBoardServerReady = () => ({ ready: true });
    mockProjectsList = vi.fn().mockRejectedValue(new Error("Network error"));
  });

  it("shows error state with warning icon", async () => {
    renderPage();
    expect(await screen.findByText("Could not load projects")).toBeInTheDocument();
  });

  it("shows the error message text", async () => {
    renderPage();
    expect(await screen.findByText(/Network error/)).toBeInTheDocument();
  });
});

describe("BoardProjectsPage — ready with single project", () => {
  it("calls api.projects.list when ready=true", async () => {
    mockUseBoardServerReady = () => ({ ready: true });
    mockProjectsList = vi.fn().mockResolvedValue([projectAlpha]);
    renderPage();
    await waitFor(() => expect(mockProjectsList).toHaveBeenCalled());
  });
});
