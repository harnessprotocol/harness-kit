import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BoardKanbanPage from "../BoardKanbanPage";
import type { Project } from "../../../lib/board-api";

// ── Mock react-router-dom useParams ───────────────────────────────

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return { ...actual, useParams: () => ({ slug: "test-project" }) };
});

// ── Mock useBoardServerReady ──────────────────────────────────────

let mockUseBoardServerReady: () => {
  ready: boolean;
  timedOut: boolean;
  installed: boolean | null;
  starting: boolean;
  error: string | null;
  retry: () => void;
  install: () => Promise<void>;
  start: () => Promise<void>;
  restart: () => Promise<void>;
};

vi.mock("../../../hooks/useBoardServerReady", () => ({
  get useBoardServerReady() {
    return mockUseBoardServerReady;
  },
}));

// ── Mock useBoardData ─────────────────────────────────────────────

let mockUseBoardData: (
  slug: string,
  ready: boolean,
) => {
  project: Project | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
};

vi.mock("../../../hooks/useBoardData", () => ({
  get useBoardData() {
    return mockUseBoardData;
  },
}));

// ── Mock board-api ────────────────────────────────────────────────

vi.mock("../../../lib/board-api", () => ({
  api: { tasks: { update: vi.fn().mockResolvedValue({}) } },
  BOARD_SERVER_BASE: "http://localhost:4800",
}));

// ── Mock board-columns ────────────────────────────────────────────

vi.mock("../../../lib/board-columns", () => ({
  COLUMNS: ["planning", "in-progress", "ai-review", "human-review", "done"],
}));

// ── Mock @dnd-kit/core ────────────────────────────────────────────

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dnd-context">{children}</div>
  ),
  DragOverlay: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drag-overlay">{children}</div>
  ),
  closestCorners: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn().mockReturnValue([]),
}));

// ── Mock board components ─────────────────────────────────────────

vi.mock("../../../components/board/BoardServerOffline", () => ({
  BoardServerOffline: () => (
    <div data-testid="board-server-offline">Board server is not running</div>
  ),
}));

vi.mock("../../../components/board/DroppableColumn", () => ({
  DroppableColumn: ({
    status,
    tasks,
  }: {
    status: string;
    tasks: unknown[];
  }) => (
    <div data-testid={`droppable-column-${status}`}>
      {status} ({tasks.length})
    </div>
  ),
}));

vi.mock("../../../components/board/SwimlaneView", () => ({
  SwimlaneView: () => <div data-testid="swimlane-view" />,
}));

vi.mock("../../../components/board/ViewToggle", () => ({
  ViewToggle: () => <div data-testid="view-toggle" />,
}));

vi.mock("../../../components/board/TaskCard", () => ({
  TaskCard: () => <div data-testid="task-card" />,
}));

vi.mock("../../../components/board/TaskDetailPanel", () => ({
  TaskDetailPanel: () => <div data-testid="task-detail-panel" />,
}));

vi.mock("../../../components/board/TaskForm", () => ({
  TaskForm: () => <div data-testid="task-form" />,
}));

// ── Fixtures ──────────────────────────────────────────────────────

const mockProject: Project = {
  name: "Test Project",
  slug: "test-project",
  next_id: 3,
  version: 2,
  epics: [
    {
      id: 1,
      name: "Epic One",
      status: "active",
      tasks: [
        {
          id: 1,
          title: "Task A",
          status: "planning",
          linked_commits: [],
          comments: [],
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
        {
          id: 2,
          title: "Task B",
          status: "in-progress",
          linked_commits: [],
          comments: [],
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

// ── Default server state ──────────────────────────────────────────

function defaultServerState(
  overrides: Partial<ReturnType<typeof mockUseBoardServerReady>> = {},
) {
  return {
    ready: false,
    timedOut: false,
    installed: true as boolean | null,
    starting: false,
    error: null as string | null,
    retry: vi.fn(),
    install: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ── Helpers ───────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter>
      <BoardKanbanPage />
    </MemoryRouter>,
  );
}

// ── Setup ─────────────────────────────────────────────────────────

beforeEach(() => {
  mockUseBoardServerReady = () => defaultServerState();
  mockUseBoardData = () => ({
    project: null,
    loading: false,
    error: null,
    refetch: vi.fn(),
  });
});

// ── Tests ─────────────────────────────────────────────────────────

describe("BoardKanbanPage — not ready state", () => {
  it("shows 'Connecting to board server...' when not ready", () => {
    mockUseBoardServerReady = () => defaultServerState({ ready: false });
    mockUseBoardData = () => ({
      project: null,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(
      screen.getByText("Connecting to board server..."),
    ).toBeInTheDocument();
  });
});

describe("BoardKanbanPage — ready but loading", () => {
  it("shows 'Loading board...' when ready but data loading", () => {
    mockUseBoardServerReady = () => defaultServerState({ ready: true });
    mockUseBoardData = () => ({
      project: null,
      loading: true,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText("Loading board...")).toBeInTheDocument();
  });
});

describe("BoardKanbanPage — loaded with project", () => {
  beforeEach(() => {
    mockUseBoardServerReady = () => defaultServerState({ ready: true });
    mockUseBoardData = () => ({
      project: mockProject,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it("shows project name when loaded", () => {
    renderPage();
    expect(screen.getByText("Test Project")).toBeInTheDocument();
  });

  it("renders 5 DroppableColumn components (one per status)", () => {
    renderPage();
    expect(screen.getByTestId("droppable-column-planning")).toBeInTheDocument();
    expect(
      screen.getByTestId("droppable-column-in-progress"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("droppable-column-ai-review"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("droppable-column-human-review"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("droppable-column-done")).toBeInTheDocument();
  });

  it("shows task count badge", () => {
    renderPage();
    expect(screen.getByText("2 tasks")).toBeInTheDocument();
  });
});

describe("BoardKanbanPage — error state", () => {
  it("shows error state when error is returned", () => {
    mockUseBoardServerReady = () => defaultServerState({ ready: true });
    mockUseBoardData = () => ({
      project: null,
      loading: false,
      error: "Connection refused",
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText("Connection refused")).toBeInTheDocument();
  });

  it("shows not-found when project is null without error", () => {
    mockUseBoardServerReady = () => defaultServerState({ ready: true });
    mockUseBoardData = () => ({
      project: null,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(
      screen.getByText('Project "test-project" not found'),
    ).toBeInTheDocument();
  });
});

describe("BoardKanbanPage — timed out", () => {
  it("shows BoardServerOffline when timedOut", () => {
    mockUseBoardServerReady = () => defaultServerState({ timedOut: true });
    mockUseBoardData = () => ({
      project: null,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByTestId("board-server-offline")).toBeInTheDocument();
  });
});
