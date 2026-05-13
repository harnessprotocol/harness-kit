import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BoardProjectsPage from "../BoardProjectsPage";
import type { Project } from "../../../lib/board-api";

// ── Mock useBoardServerReady ───────────────────────────────────

let mockUseBoardServerReady: () => { ready: boolean };

vi.mock("../../../hooks/useBoardServerReady", () => ({
  get useBoardServerReady() {
    return mockUseBoardServerReady;
  },
}));

// ── Mock board-api ─────────────────────────────────────────────

let mockProjectsList: () => Promise<Project[]>;
let mockProjectsCreate: (body: { name: string; description?: string; color?: string }) => Promise<Project>;

vi.mock("../../../lib/board-api", () => ({
  get api() {
    return { projects: { list: mockProjectsList, create: mockProjectsCreate } };
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
  mockProjectsCreate = vi.fn().mockResolvedValue(projectAlpha);
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
    expect(await screen.findByText("Create your first project")).toBeInTheDocument();
  });

  it("creates a project from the empty state", async () => {
    mockProjectsCreate = vi.fn().mockResolvedValue(projectAlpha);
    renderPage();

    fireEvent.change(await screen.findByPlaceholderText("Enterprise demo workspace"), {
      target: { value: "Enterprise demo workspace" },
    });
    fireEvent.click(screen.getByText("Create Project"));

    await waitFor(() => {
      expect(mockProjectsCreate).toHaveBeenCalledWith({
        name: "Enterprise demo workspace",
        description: undefined,
        color: "#0ea5e9",
      });
    });
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
