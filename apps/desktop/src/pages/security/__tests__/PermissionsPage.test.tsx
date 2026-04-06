import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { PermissionsState, SecurityPreset } from "@harness-kit/shared";
import PermissionsPage from "../PermissionsPage";

// ── Mocks ─────────────────────────────────────────────────────

const mockReadPermissions = vi.fn();
const mockUpdatePermissions = vi.fn();
const mockListSecurityPresets = vi.fn();
const mockApplySecurityPreset = vi.fn();

vi.mock("../../../lib/tauri", () => ({
  readPermissions: () => mockReadPermissions(),
  updatePermissions: (...args: unknown[]) => mockUpdatePermissions(...args),
  listSecurityPresets: () => mockListSecurityPresets(),
  applySecurityPreset: (...args: unknown[]) => mockApplySecurityPreset(...args),
  detectClaudeAccount: () => Promise.resolve({ logged_in: false, subscription_type: null, auto_mode_available: false }),
  getHarnessHealth: () => Promise.resolve([]),
}));

vi.mock("../../../lib/preferences", () => ({
  getPermissionMode: () => "skip",
  setPermissionMode: vi.fn(),
  getAllowedTools: () => ["Read", "Grep", "Glob"],
  setAllowedTools: vi.fn(),
  getHarnessPermissionOverrides: () => ({}),
  setHarnessPermissionOverrides: vi.fn(),
  resetPermissionDefaults: vi.fn(),
  getAutoModeUnlocked: () => false,
  setAutoModeUnlocked: vi.fn(),
  DEFAULT_ALLOWED_TOOLS: ["Read", "Grep", "Glob"],
  getBudgetGuard: () => ({ enabled: false }),
  setBudgetGuard: vi.fn(),
  getResilienceConfig: () => ({}),
  setResilienceConfig: vi.fn(),
}));

vi.mock("../../../lib/preferences", () => ({
  getPermissionMode: () => "skip",
  setPermissionMode: vi.fn(),
  getAllowedTools: () => ["Read", "Grep", "Glob"],
  setAllowedTools: vi.fn(),
  getHarnessPermissionOverrides: () => ({}),
  setHarnessPermissionOverrides: vi.fn(),
  resetPermissionDefaults: vi.fn(),
  DEFAULT_ALLOWED_TOOLS: ["Read", "Grep", "Glob"],
}));

// ── Fixtures ──────────────────────────────────────────────────

const EMPTY_PERMISSIONS: PermissionsState = {
  tools: { allow: [], deny: [], ask: [] },
  paths: { writable: [], readonly: [] },
  network: { allowedHosts: [] },
};

const POPULATED_PERMISSIONS: PermissionsState = {
  tools: { allow: ["Read", "Write"], deny: ["Bash"], ask: ["Agent"] },
  paths: { writable: ["~/repos"], readonly: ["/tmp"] },
  network: { allowedHosts: ["github.com", "api.anthropic.com"] },
};

const STRICT_PRESET: SecurityPreset = {
  id: "strict",
  name: "Strict",
  description: "Minimal access — read-only tools only",
  permissions: {
    tools: { allow: ["Read", "Glob", "Grep"], deny: ["Bash", "Write", "Edit"], ask: [] },
    paths: { writable: [], readonly: ["."] },
    network: { allowedHosts: [] },
  },
};

const STANDARD_PRESET: SecurityPreset = {
  id: "standard",
  name: "Standard",
  description: "Balanced access for typical development",
  permissions: EMPTY_PERMISSIONS,
};

const PERMISSIVE_PRESET: SecurityPreset = {
  id: "permissive",
  name: "Permissive",
  description: "Full access — all tools allowed",
  permissions: {
    tools: { allow: ["*"], deny: [], ask: [] },
    paths: { writable: ["*"], readonly: [] },
    network: { allowedHosts: ["*"] },
  },
};

// ── Helpers ───────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter>
      <PermissionsPage />
    </MemoryRouter>,
  );
}

// ── Setup ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Simulate Tauri desktop environment so tauriAvailable === true
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  mockReadPermissions.mockResolvedValue(EMPTY_PERMISSIONS);
  mockUpdatePermissions.mockResolvedValue(undefined);
  mockListSecurityPresets.mockResolvedValue([STRICT_PRESET, STANDARD_PRESET, PERMISSIVE_PRESET]);
  mockApplySecurityPreset.mockResolvedValue(undefined);
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

// ── Tests ─────────────────────────────────────────────────────

describe("PermissionsPage — loading state", () => {
  it("shows 'Loading…' before data arrives", () => {
    mockReadPermissions.mockReturnValue(new Promise(() => {}));
    mockListSecurityPresets.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("hides 'Loading…' after data loads", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument(),
    );
  });
});

describe("PermissionsPage — error state", () => {
  it("shows error message when readPermissions rejects", async () => {
    mockReadPermissions.mockRejectedValue(new Error("Permission denied"));
    renderPage();
    expect(await screen.findByText(/Permission denied/)).toBeInTheDocument();
  });

  it("shows the page heading even in error state", async () => {
    mockReadPermissions.mockRejectedValue(new Error("oops"));
    renderPage();
    await screen.findByText(/oops/);
    expect(screen.getByText("Permissions")).toBeInTheDocument();
  });
});

describe("PermissionsPage — preset buttons", () => {
  it("renders all three preset buttons", async () => {
    renderPage();
    expect(await screen.findByText("Strict")).toBeInTheDocument();
    expect(screen.getByText("Standard")).toBeInTheDocument();
    expect(screen.getByText("Permissive")).toBeInTheDocument();
  });

  it("renders preset descriptions", async () => {
    renderPage();
    expect(await screen.findByText("Minimal access — read-only tools only")).toBeInTheDocument();
    expect(screen.getByText("Balanced access for typical development")).toBeInTheDocument();
    expect(screen.getByText("Full access — all tools allowed")).toBeInTheDocument();
  });

  it("clicking a preset opens a confirmation dialog", async () => {
    renderPage();
    const strictBtn = await screen.findByText("Strict");
    fireEvent.click(strictBtn.closest("button")!);

    // The confirmation text is split across elements: "Apply <strong>Strict</strong> preset?"
    // Match the <p> element specifically by looking for a <strong> child with "Strict"
    await waitFor(() => {
      const strongs = document.querySelectorAll("strong");
      const strictStrong = Array.from(strongs).find((el) => el.textContent === "Strict");
      expect(strictStrong).toBeDefined();
      // The parent paragraph should contain the confirmation text
      expect(strictStrong?.closest("p")?.textContent).toMatch(/Apply.*preset\? This will overwrite/);
    });
  });

  it("confirmation dialog shows the preset name in bold", async () => {
    renderPage();
    const permissiveBtn = await screen.findByText("Permissive");
    fireEvent.click(permissiveBtn.closest("button")!);

    // Wait for the confirmation <strong> element to appear
    await waitFor(() => {
      const strongs = document.querySelectorAll("strong");
      const hasPermissive = Array.from(strongs).some((el) => el.textContent === "Permissive");
      expect(hasPermissive).toBe(true);
    });
  });

  it("Apply button in confirmation calls applySecurityPreset with preset id", async () => {
    renderPage();
    const strictBtn = await screen.findByText("Strict");
    fireEvent.click(strictBtn.closest("button")!);

    const applyBtn = await screen.findByRole("button", { name: "Apply" });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(mockApplySecurityPreset).toHaveBeenCalledWith("strict");
    });
  });

  it("Cancel button dismisses the confirmation dialog", async () => {
    renderPage();
    const strictBtn = await screen.findByText("Strict");
    fireEvent.click(strictBtn.closest("button")!);

    await screen.findByRole("button", { name: "Apply" });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();
    });
  });

  it("does not render preset section when no presets are returned", async () => {
    mockListSecurityPresets.mockResolvedValue([]);
    renderPage();
    // Wait for load to finish
    await waitFor(() =>
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("Quick preset")).not.toBeInTheDocument();
  });
});

describe("PermissionsPage — permissions display", () => {
  beforeEach(() => {
    mockReadPermissions.mockResolvedValue(POPULATED_PERMISSIONS);
  });

  it("renders the page heading", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Permissions")).toBeInTheDocument();
  });

  it("shows allowed tool chips", async () => {
    renderPage();
    expect(await screen.findByText("Read")).toBeInTheDocument();
    expect(screen.getByText("Write")).toBeInTheDocument();
  });

  it("shows denied tool chips", async () => {
    renderPage();
    expect(await screen.findByText("Bash")).toBeInTheDocument();
  });

  it("shows ask tool chips", async () => {
    renderPage();
    expect(await screen.findByText("Agent")).toBeInTheDocument();
  });

  it("shows writable path chips", async () => {
    renderPage();
    expect(await screen.findByText("~/repos")).toBeInTheDocument();
  });

  it("shows readonly path chips", async () => {
    renderPage();
    expect(await screen.findByText("/tmp")).toBeInTheDocument();
  });

  it("shows allowed host chips", async () => {
    renderPage();
    expect(await screen.findByText("github.com")).toBeInTheDocument();
    expect(screen.getByText("api.anthropic.com")).toBeInTheDocument();
  });
});

describe("PermissionsPage — Save button state", () => {
  it("Save button starts disabled (not dirty)", async () => {
    renderPage();
    const saveBtn = await screen.findByRole("button", { name: "Save to settings.json" });
    expect(saveBtn).toBeDisabled();
  });

  it("Save button becomes enabled after adding a tool", async () => {
    mockReadPermissions.mockResolvedValue(EMPTY_PERMISSIONS);
    renderPage();

    // Wait for the page to finish loading
    await waitFor(() =>
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument(),
    );

    // Type in the Allow input and click Add
    const inputs = screen.getAllByPlaceholderText("Add allow rule…");
    fireEvent.change(inputs[0], { target: { value: "Read" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);

    const saveBtn = screen.getByRole("button", { name: "Save to settings.json" });
    expect(saveBtn).not.toBeDisabled();
  });

  it("clicking Save calls updatePermissions", async () => {
    mockReadPermissions.mockResolvedValue(EMPTY_PERMISSIONS);
    renderPage();

    await waitFor(() =>
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument(),
    );

    // Dirty the state by adding a tool
    const inputs = screen.getAllByPlaceholderText("Add allow rule…");
    fireEvent.change(inputs[0], { target: { value: "Read" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);

    const saveBtn = screen.getByRole("button", { name: "Save to settings.json" });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdatePermissions).toHaveBeenCalledTimes(1);
    });
  });
});

describe("PermissionsPage — add/remove items", () => {
  beforeEach(() => {
    mockReadPermissions.mockResolvedValue(POPULATED_PERMISSIONS);
  });

  it("removes a tool chip when x button is clicked", async () => {
    renderPage();
    await screen.findByText("Read");

    // Each chip has an 'x' button — find the one inside the Read chip
    const readChip = screen.getByText("Read").closest("span")!;
    const removeBtn = readChip.querySelector("button")!;
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(screen.queryByText("Read")).not.toBeInTheDocument();
    });
  });

  it("removes a host chip when x button is clicked", async () => {
    renderPage();
    await screen.findByText("github.com");

    const hostChip = screen.getByText("github.com").closest("span")!;
    const removeBtn = hostChip.querySelector("button")!;
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(screen.queryByText("github.com")).not.toBeInTheDocument();
    });
  });

  it("adding a host via input appends it to the list", async () => {
    mockReadPermissions.mockResolvedValue(EMPTY_PERMISSIONS);
    renderPage();

    await waitFor(() =>
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument(),
    );

    const hostInput = screen.getByPlaceholderText("Add host…");
    fireEvent.change(hostInput, { target: { value: "example.com" } });

    // Click the Add button next to the host input
    const addBtns = screen.getAllByRole("button", { name: "Add" });
    fireEvent.click(addBtns[addBtns.length - 1]);

    expect(await screen.findByText("example.com")).toBeInTheDocument();
  });

  it("adding via Enter key works", async () => {
    mockReadPermissions.mockResolvedValue(EMPTY_PERMISSIONS);
    renderPage();

    await waitFor(() =>
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument(),
    );

    const hostInput = screen.getByPlaceholderText("Add host…");
    fireEvent.change(hostInput, { target: { value: "example.org" } });
    fireEvent.keyDown(hostInput, { key: "Enter" });

    expect(await screen.findByText("example.org")).toBeInTheDocument();
  });
});

describe("PermissionsPage — section labels", () => {
  it("shows Tools section label", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Tools")).toBeInTheDocument();
  });

  it("shows Paths section label", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Paths")).toBeInTheDocument();
  });

  it("shows Network section label", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/Network/)).toBeInTheDocument();
  });
});
