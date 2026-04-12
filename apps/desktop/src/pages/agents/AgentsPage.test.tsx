import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AgentsPage from "./AgentsPage";
import type { AgentInfo } from "./AgentsPage";

// ── Mock Tauri invoke ────────────────────────────────────────

const mockDetectAgents = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string) => {
    if (cmd === "detect_agents") return mockDetectAgents();
    return Promise.resolve([]);
  },
  Channel: vi.fn(),
}));

// ── Fixtures ─────────────────────────────────────────────────

const installedAgent: AgentInfo = {
  id: "claude",
  name: "Claude Code",
  binary: "claude",
  installed: true,
  version: "v1.2.3",
  protocol: "stdio",
  description: "Anthropic's official CLI for Claude",
  addToComparator: false,
};

const notInstalledAgent: AgentInfo = {
  id: "goose",
  name: "Goose",
  binary: "goose",
  installed: false,
  version: null,
  protocol: "stdio",
  description: "Block's open-source AI developer agent",
  addToComparator: false,
};

const addableAgent: AgentInfo = {
  id: "aider",
  name: "Aider",
  binary: "aider",
  installed: true,
  version: "v0.50.0",
  protocol: "stdio",
  description: "AI pair programming in your terminal",
  addToComparator: true,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <AgentsPage />
    </MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────────

describe("AgentsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading skeletons before agents resolve", () => {
    // Never resolves during this test
    mockDetectAgents.mockReturnValue(new Promise(() => {}));
    renderPage();

    // Heading is visible
    expect(screen.getByText("Agents")).toBeInTheDocument();
    // No agent cards while loading
    expect(screen.queryAllByTestId("agent-card")).toHaveLength(0);
  });

  it("renders installed agent with version badge", async () => {
    mockDetectAgents.mockResolvedValue([installedAgent]);
    renderPage();

    await waitFor(() => expect(screen.getByTestId("installed-badge")).toBeInTheDocument());

    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByTestId("installed-badge").textContent).toContain("v1.2.3");
  });

  it("renders uninstalled agent with 'Not found' badge and disabled Add button", async () => {
    mockDetectAgents.mockResolvedValue([notInstalledAgent]);
    renderPage();

    await waitFor(() => expect(screen.getByTestId("not-found-badge")).toBeInTheDocument());

    const addBtn = screen.getByTestId("add-to-comparator-btn");
    expect(addBtn).toBeDisabled();
  });

  it("enables 'Add to Comparator' button for installed, addable agent", async () => {
    mockDetectAgents.mockResolvedValue([addableAgent]);
    renderPage();

    await waitFor(() => expect(screen.getByTestId("add-to-comparator-btn")).toBeInTheDocument());

    const addBtn = screen.getByTestId("add-to-comparator-btn");
    expect(addBtn).not.toBeDisabled();
  });

  it("disables 'Add to Comparator' after click", async () => {
    mockDetectAgents.mockResolvedValue([addableAgent]);
    renderPage();

    await waitFor(() => expect(screen.getByTestId("add-to-comparator-btn")).not.toBeDisabled());

    fireEvent.click(screen.getByTestId("add-to-comparator-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("add-to-comparator-btn")).toBeDisabled();
    });
  });

  it("renders protocol badge for each agent", async () => {
    mockDetectAgents.mockResolvedValue([installedAgent]);
    renderPage();

    await waitFor(() => expect(screen.getByTestId("protocol-badge")).toBeInTheDocument());
    expect(screen.getByTestId("protocol-badge").textContent).toBe("stdio");
  });

  it("shows detected count in subtitle", async () => {
    mockDetectAgents.mockResolvedValue([installedAgent, notInstalledAgent]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/1 of 2 agents detected/)).toBeInTheDocument();
    });
  });

  it("renders error state on invoke failure", async () => {
    mockDetectAgents.mockRejectedValue(new Error("detection failed"));
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Failed to detect agents/)).toBeInTheDocument();
    });
  });
});
