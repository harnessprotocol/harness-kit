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
  mockReadPermissions.mockResolvedValue({ ...EMPTY_PERMISSIONS, sha256: "d1" });
  mockUpdatePermissions.mockResolvedValue("d2");
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
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't read Claude's permission settings");
    // The raw error waits behind Details (AC-20).
    expect(screen.getByText("Permission denied")).not.toBeVisible();
  });

  it("shows the page heading even in error state", async () => {
    mockReadPermissions.mockRejectedValue(new Error("oops"));
    renderPage();
    await screen.findByText("oops");
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
      expect(strictStrong?.closest("p")?.textContent).toMatch(/Apply.*preset\? Its rules are merged into your existing rules/);
    });
  });

  it("says existing allows are kept, so a preset is never read as narrowing them", async () => {
    renderPage();
    fireEvent.click((await screen.findByText("Strict")).closest("button")!);
    const strong = await waitFor(() => {
      const el = Array.from(document.querySelectorAll("strong")).find((s) => s.textContent === "Strict");
      expect(el).toBeDefined();
      return el!;
    });
    const text = strong.closest("p")!.textContent!;
    expect(text).toMatch(/existing allow rules, writable paths and allowed hosts are kept/i);
    expect(text).not.toMatch(/replace|only/i);
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
      expect(mockApplySecurityPreset).toHaveBeenCalledWith("strict", "d1");
    });
  });

  it("lists deny rules the preset would drop and applies only after a second confirmation", async () => {
    mockApplySecurityPreset
      .mockResolvedValueOnce({ applied: false, droppedDeny: ["Bash(rm:*)"] })
      .mockResolvedValueOnce({ applied: true, droppedDeny: ["Bash(rm:*)"] });
    renderPage();
    fireEvent.click((await screen.findByText("Strict")).closest("button")!);
    fireEvent.click(await screen.findByRole("button", { name: "Apply" }));

    expect(await screen.findByText("Bash(rm:*)")).toBeInTheDocument();
    expect(mockApplySecurityPreset).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Remove deny rules and apply" }));
    await waitFor(() => {
      expect(mockApplySecurityPreset).toHaveBeenLastCalledWith("strict", "d1", ["Bash(rm:*)"]);
    });
  });

  it("sends back exactly the deny list the user was shown", async () => {
    mockApplySecurityPreset
      .mockResolvedValueOnce({ applied: false, droppedDeny: ["Bash(rm:*)", "Bash(curl:*)"] })
      .mockResolvedValueOnce({ applied: true, droppedDeny: ["Bash(rm:*)", "Bash(curl:*)"] });
    renderPage();
    fireEvent.click((await screen.findByText("Strict")).closest("button")!);
    fireEvent.click(await screen.findByRole("button", { name: "Apply" }));
    await screen.findByText("Bash(curl:*)");
    fireEvent.click(screen.getByRole("button", { name: "Remove deny rules and apply" }));
    await waitFor(() => expect(mockApplySecurityPreset).toHaveBeenCalledTimes(2));
    expect(mockApplySecurityPreset.mock.calls[1][2]).toEqual(["Bash(rm:*)", "Bash(curl:*)"]);
  });

  it("forgets the confirmed list when the apply is refused, so the next try shows a fresh one", async () => {
    mockApplySecurityPreset
      .mockResolvedValueOnce({ applied: false, droppedDeny: ["Bash(rm:*)"] })
      .mockRejectedValueOnce(new Error("The deny rules this preset would remove are not the ones you confirmed"))
      .mockResolvedValueOnce({ applied: false, droppedDeny: ["Bash(rm:*)", "Bash(curl:*)"] });
    renderPage();
    fireEvent.click((await screen.findByText("Strict")).closest("button")!);
    fireEvent.click(await screen.findByRole("button", { name: "Apply" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove deny rules and apply" }));
    await screen.findByRole("alert");
    fireEvent.click(await screen.findByRole("button", { name: "Apply" }));
    await waitFor(() => expect(mockApplySecurityPreset).toHaveBeenCalledTimes(3));
    // The third call carries no stale confirmation.
    expect(mockApplySecurityPreset.mock.calls[2]).toEqual(["strict", "d1"]);
  });

  it("reloads the digest after a preset is applied", async () => {
    mockApplySecurityPreset.mockResolvedValue({ applied: true, droppedDeny: [] });
    mockReadPermissions
      .mockResolvedValueOnce({ ...EMPTY_PERMISSIONS, sha256: "d1" })
      .mockResolvedValue({ ...EMPTY_PERMISSIONS, sha256: "d9" });
    renderPage();
    fireEvent.click((await screen.findByText("Strict")).closest("button")!);
    fireEvent.click(await screen.findByRole("button", { name: "Apply" }));
    await waitFor(() => expect(mockReadPermissions).toHaveBeenCalledTimes(2));
    fireEvent.click((await screen.findByText("Standard")).closest("button")!);
    fireEvent.click(await screen.findByRole("button", { name: "Apply" }));
    await waitFor(() => expect(mockApplySecurityPreset).toHaveBeenCalledTimes(2));
    expect(mockApplySecurityPreset).toHaveBeenLastCalledWith("standard", "d9");
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
    mockReadPermissions.mockResolvedValue({ ...EMPTY_PERMISSIONS, sha256: "d1" });
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
    // The digest of the file the edits started from rides along.
    expect(mockUpdatePermissions.mock.calls[0][1]).toBe("d1");
  });

  it("a second Save sends the digest the first Save returned", async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    const add = (value: string) => {
      fireEvent.change(screen.getAllByPlaceholderText("Add allow rule…")[0], { target: { value } });
      fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);
    };
    add("Read");
    fireEvent.click(screen.getByRole("button", { name: "Save to settings.json" }));
    await waitFor(() => expect(mockUpdatePermissions).toHaveBeenCalledTimes(1));
    add("Grep");
    await waitFor(() => expect(screen.getByRole("button", { name: "Save to settings.json" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Save to settings.json" }));
    await waitFor(() => expect(mockUpdatePermissions).toHaveBeenCalledTimes(2));
    expect(mockUpdatePermissions.mock.calls[1][1]).toBe("d2");
  });

  it("offers to reload when settings.json changed on disk since it was read", async () => {
    mockUpdatePermissions.mockRejectedValue(
      "Refusing to write 'settings.json': it changed on disk since it was read (expected a, found b)",
    );
    renderPage();
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    fireEvent.change(screen.getAllByPlaceholderText("Add allow rule…")[0], { target: { value: "Read" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Save to settings.json" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("settings.json changed on disk");
    mockReadPermissions.mockResolvedValue({ ...POPULATED_PERMISSIONS, sha256: "d7" });
    fireEvent.click(screen.getByRole("button", { name: "Reload from disk" }));
    expect(await screen.findByText("~/repos")).toBeInTheDocument();
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
