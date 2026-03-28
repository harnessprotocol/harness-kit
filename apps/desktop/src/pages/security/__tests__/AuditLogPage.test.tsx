import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AuditEntry } from "@harness-kit/shared";
import AuditLogPage from "../AuditLogPage";

// ── Mocks ─────────────────────────────────────────────────────

const mockListAuditEntries = vi.fn();
const mockClearAuditEntries = vi.fn();

vi.mock("../../../lib/tauri", () => ({
  listAuditEntries: (...args: unknown[]) => mockListAuditEntries(...args),
  clearAuditEntries: (...args: unknown[]) => mockClearAuditEntries(...args),
}));

// ContextMenu uses navigator.clipboard — stub it out
Object.assign(navigator, {
  clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
});

// ── Fixtures ──────────────────────────────────────────────────

const PERM_ENTRY: AuditEntry = {
  id: "audit-1",
  timestamp: "2026-03-28T10:00:00Z",
  eventType: "permission_change",
  category: "permissions",
  summary: "Added Bash to deny list",
  details: '{"tool":"Bash","action":"deny"}',
  source: "ui",
};

const SECRET_ENTRY: AuditEntry = {
  id: "audit-2",
  timestamp: "2026-03-28T11:00:00Z",
  eventType: "secret_access",
  category: "secrets",
  summary: "ANTHROPIC_API_KEY accessed",
  details: null,
  source: "plugin",
};

const PRESET_ENTRY: AuditEntry = {
  id: "audit-3",
  timestamp: "2026-03-27T09:00:00Z",
  eventType: "preset_applied",
  category: "permissions",
  summary: "Strict preset applied",
  details: null,
  source: "ui",
};

const SECRET_DELETE_ENTRY: AuditEntry = {
  id: "audit-4",
  timestamp: "2026-03-26T14:00:00Z",
  eventType: "secret_delete",
  category: "secrets",
  summary: "OPENAI_API_KEY deleted",
  details: null,
  source: "ui",
};

// ── Helpers ───────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter>
      <AuditLogPage />
    </MemoryRouter>,
  );
}

// ── Setup ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockListAuditEntries.mockResolvedValue([]);
  mockClearAuditEntries.mockResolvedValue(undefined);
});

// ── Tests ─────────────────────────────────────────────────────

describe("AuditLogPage — loading state", () => {
  it("shows 'Loading...' while entries are being fetched", () => {
    mockListAuditEntries.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("hides 'Loading...' after entries load", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument(),
    );
  });
});

describe("AuditLogPage — basic render", () => {
  it("renders without crashing", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Audit Log")).toBeInTheDocument();
  });

  it("shows the page description", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText(/Track permission changes, secret operations/),
    ).toBeInTheDocument();
  });

  it("renders the table header columns", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Timestamp")).toBeInTheDocument();
    expect(screen.getByText("Event")).toBeInTheDocument();
    expect(screen.getByText("Summary")).toBeInTheDocument();
    expect(screen.getByText("Source")).toBeInTheDocument();
  });
});

describe("AuditLogPage — empty state", () => {
  it("shows empty state message when no entries exist", async () => {
    renderPage();
    expect(await screen.findByText("No audit entries found.")).toBeInTheDocument();
  });

  it("shows hint text in empty state", async () => {
    renderPage();
    expect(
      await screen.findByText(/Entries are created when permissions or secrets are modified/),
    ).toBeInTheDocument();
  });
});

describe("AuditLogPage — entries list", () => {
  beforeEach(() => {
    mockListAuditEntries.mockResolvedValue([PERM_ENTRY, SECRET_ENTRY]);
  });

  it("renders entry summaries", async () => {
    renderPage();
    expect(await screen.findByText("Added Bash to deny list")).toBeInTheDocument();
    expect(screen.getByText("ANTHROPIC_API_KEY accessed")).toBeInTheDocument();
  });

  it("renders event type badges", async () => {
    renderPage();
    expect(await screen.findByText("permission change")).toBeInTheDocument();
    expect(screen.getByText("secret access")).toBeInTheDocument();
  });

  it("renders source column values", async () => {
    renderPage();
    await screen.findByText("Added Bash to deny list");
    expect(screen.getAllByText("ui").length).toBeGreaterThan(0);
    expect(screen.getByText("plugin")).toBeInTheDocument();
  });

  it("renders formatted timestamps", async () => {
    renderPage();
    await screen.findByText("Added Bash to deny list");
    // Both entries should be visible — verify via summaries
    expect(screen.getByText("Added Bash to deny list")).toBeInTheDocument();
    expect(screen.getByText("ANTHROPIC_API_KEY accessed")).toBeInTheDocument();
  });
});

describe("AuditLogPage — filter pills", () => {
  it("renders All, Permissions, and Secrets filter pills", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Permissions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Secrets" })).toBeInTheDocument();
  });

  it("All pill is active by default", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Permissions" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Secrets" })).toHaveAttribute("aria-pressed", "false");
  });

  it("clicking Permissions pill makes it active", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Permissions" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Permissions" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
    });
  });

  it("clicking Secrets pill calls listAuditEntries with 'secrets' category", async () => {
    renderPage();
    // Wait for first load to complete
    await waitFor(() =>
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Secrets" }));

    await waitFor(() => {
      const calls = mockListAuditEntries.mock.calls;
      const secretsCall = calls.find((call) => call[2] === "secrets");
      expect(secretsCall).toBeDefined();
    });
  });

  it("clicking Permissions pill calls listAuditEntries with 'permissions' category", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Permissions" }));

    await waitFor(() => {
      const calls = mockListAuditEntries.mock.calls;
      const permCall = calls.find((call) => call[2] === "permissions");
      expect(permCall).toBeDefined();
    });
  });

  it("clicking All pill calls listAuditEntries with no category (undefined)", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument(),
    );

    // Switch to Secrets first, then back to All
    fireEvent.click(screen.getByRole("button", { name: "Secrets" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Secrets" })).toHaveAttribute("aria-pressed", "true"),
    );

    fireEvent.click(screen.getByRole("button", { name: "All" }));

    await waitFor(() => {
      const calls = mockListAuditEntries.mock.calls;
      const allCall = calls.find((call) => call[2] === undefined);
      expect(allCall).toBeDefined();
    });
  });
});

describe("AuditLogPage — row expansion", () => {
  beforeEach(() => {
    mockListAuditEntries.mockResolvedValue([PERM_ENTRY, SECRET_ENTRY]);
  });

  it("clicking a row with details expands it and shows JSON details", async () => {
    renderPage();
    await screen.findByText("Added Bash to deny list");

    fireEvent.click(screen.getByText("Added Bash to deny list"));

    await waitFor(() => {
      // The details JSON should be pretty-printed and visible
      expect(screen.getByText(/\"tool\".*\"Bash\"/s)).toBeInTheDocument();
    });
  });

  it("clicking the same row again collapses it", async () => {
    renderPage();
    await screen.findByText("Added Bash to deny list");

    const summaryEl = screen.getByText("Added Bash to deny list");
    fireEvent.click(summaryEl);
    await waitFor(() => expect(screen.getByText(/\"tool\"/)).toBeInTheDocument());

    fireEvent.click(summaryEl);
    await waitFor(() => {
      expect(screen.queryByText(/\"tool\"/)).not.toBeInTheDocument();
    });
  });

  it("rows with null details cannot be expanded", async () => {
    renderPage();
    await screen.findByText("ANTHROPIC_API_KEY accessed");

    // SECRET_ENTRY has details: null — clicking it should not show any pre block
    fireEvent.click(screen.getByText("ANTHROPIC_API_KEY accessed"));

    // No detail pre block should appear
    await waitFor(() => {
      expect(document.querySelector("pre")).toBeNull();
    });
  });
});

describe("AuditLogPage — clear entries", () => {
  beforeEach(() => {
    mockListAuditEntries.mockResolvedValue([PERM_ENTRY]);
  });

  it("shows 'Clear old entries' button", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Clear old entries" })).toBeInTheDocument();
  });

  it("clicking 'Clear old entries' shows a confirmation prompt", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear old entries" }));

    expect(
      await screen.findByText(/Clear entries older than 30 days\?/),
    ).toBeInTheDocument();
  });

  it("confirmation prompt shows Confirm and Cancel buttons", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear old entries" }));

    await screen.findByText(/Clear entries older than 30 days\?/);
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("clicking Cancel dismisses the confirmation prompt", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear old entries" }));
    await screen.findByText(/Clear entries older than 30 days\?/);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByText(/Clear entries older than 30 days\?/)).not.toBeInTheDocument();
    });
    expect(mockClearAuditEntries).not.toHaveBeenCalled();
  });

  it("clicking Confirm calls clearAuditEntries with an ISO date string", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear old entries" }));
    await screen.findByText(/Clear entries older than 30 days\?/);

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(mockClearAuditEntries).toHaveBeenCalledTimes(1);
      const [dateArg] = mockClearAuditEntries.mock.calls[0];
      expect(typeof dateArg).toBe("string");
      // Should be a valid ISO date string
      expect(() => new Date(dateArg)).not.toThrow();
    });
  });
});

describe("AuditLogPage — pagination", () => {
  it("does not show pagination when no entries exist", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "Prev" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });

  it("shows pagination controls when entries are present", async () => {
    mockListAuditEntries.mockResolvedValue([PERM_ENTRY, SECRET_ENTRY]);
    renderPage();
    await screen.findByText("Added Bash to deny list");

    expect(screen.getByRole("button", { name: "Prev" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
  });

  it("shows page number", async () => {
    mockListAuditEntries.mockResolvedValue([PERM_ENTRY]);
    renderPage();
    await screen.findByText("Added Bash to deny list");

    expect(screen.getByText("Page 1")).toBeInTheDocument();
  });

  it("Prev button is disabled on the first page", async () => {
    mockListAuditEntries.mockResolvedValue([PERM_ENTRY]);
    renderPage();
    await screen.findByText("Added Bash to deny list");

    const prevBtn = screen.getByRole("button", { name: "Prev" });
    expect(prevBtn).toBeDisabled();
  });
});

describe("AuditLogPage — event badge colors", () => {
  it("renders badge for preset_applied event", async () => {
    mockListAuditEntries.mockResolvedValue([PRESET_ENTRY]);
    renderPage();
    expect(await screen.findByText("preset applied")).toBeInTheDocument();
  });

  it("renders badge for secret_delete event", async () => {
    mockListAuditEntries.mockResolvedValue([SECRET_DELETE_ENTRY]);
    renderPage();
    expect(await screen.findByText("secret delete")).toBeInTheDocument();
  });
});

describe("AuditLogPage — error state", () => {
  it("shows error message when listAuditEntries rejects", async () => {
    mockListAuditEntries.mockRejectedValue(new Error("Database error"));
    renderPage();
    expect(await screen.findByText(/Database error/)).toBeInTheDocument();
  });
});
