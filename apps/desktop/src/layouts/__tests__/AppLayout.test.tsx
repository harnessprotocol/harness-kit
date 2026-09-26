import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { MemoryRouter, useLocation } from "react-router-dom";
import AppLayout from "../AppLayout";
import { NAV, visibleNav } from "../../nav";
import { getCurrentProjectDir, getRecentProjectDirs } from "../../lib/project-dir";

// ── Mocks ─────────────────────────────────────────────────────

const mockStartDragging = vi.fn().mockResolvedValue(undefined);
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({ startDragging: mockStartDragging })),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

const mockGrantProjectScope = vi.fn().mockResolvedValue(undefined);
vi.mock("../../lib/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/tauri")>()),
  grantProjectScope: (...args: unknown[]) => mockGrantProjectScope(...args),
}));

// Tauri APIs used by theme lib must not throw in jsdom
vi.mock("../../lib/theme", () => ({
  initTheme: vi.fn(),
  getTheme: vi.fn(() => "system"),
  setTheme: vi.fn(),
}));

vi.mock("../../lib/preferences", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/preferences")>();
  return {
    ...actual,
    initPreferences: vi.fn(),
  };
});

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      media: "",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
});

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={["/harness/plugins"]}>
      <AppLayout />
    </MemoryRouter>,
  );
}

// ── Tests ─────────────────────────────────────────────────────

describe("sidebar layout — vibrancy regression guard", () => {
  it("sidebar is present", () => {
    renderLayout();
    const aside = document.querySelector("aside");
    expect(aside).not.toBeNull();
  });

  it("sidebar has backdropFilter with blur", () => {
    renderLayout();
    const aside = document.querySelector("aside");
    expect(aside!.style.backdropFilter).toMatch(/blur/);
  });

  it("sidebar has fixed width equal to sidebar-width variable", () => {
    renderLayout();
    const aside = document.querySelector("aside");
    expect(aside!.style.width).toBe("var(--sidebar-width)");
  });
});

describe("sidebar renders all nav sections", () => {
  it("renders every section label", () => {
    renderLayout();
    for (const entry of visibleNav({ comparator: false })) {
      expect(screen.getByText(entry.label)).toBeInTheDocument();
    }
  });

  it("shows the shortcut badge that matches the key", () => {
    renderLayout();
    for (const entry of visibleNav({ comparator: false })) {
      if (!entry.shortcut) continue;
      expect(screen.getByText(`⌘${entry.shortcut}`)).toBeInTheDocument();
    }
  });

  it("omits Comparator until the lab is on", () => {
    renderLayout();
    expect(screen.queryByText("Comparator")).not.toBeInTheDocument();
  });

  it("does not render retired top-level sections", () => {
    renderLayout();
    for (const label of ["Fleet", "Drift", "Observatory", "Configure"]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });
});

describe("keyboard navigation", () => {
  // Guards against the packages/ui NavItem migration regressing keyboard activation:
  // NavItem is a role="link" div, which has no native Enter/Space behavior, so the
  // component must forward those keys to its click handler.
  function LocationSpy() {
    const loc = useLocation();
    return <div data-testid="loc">{loc.pathname}</div>;
  }

  it("activates a top-level nav item with Enter", () => {
    render(
      <MemoryRouter initialEntries={["/harness/plugins"]}>
        <AppLayout />
        <LocationSpy />
      </MemoryRouter>,
    );
    const marketplace = screen.getByText("Marketplace").closest('[role="link"]');
    expect(marketplace).not.toBeNull();
    fireEvent.keyDown(marketplace!, { key: "Enter" });
    expect(screen.getByTestId("loc").textContent).toBe("/marketplace");
  });

  it("activates a top-level nav item with Space", () => {
    render(
      <MemoryRouter initialEntries={["/harness/plugins"]}>
        <AppLayout />
        <LocationSpy />
      </MemoryRouter>,
    );
    const machine = screen.getByText("Machine").closest('[role="link"]');
    expect(machine).not.toBeNull();
    fireEvent.keyDown(machine!, { key: " " });
    expect(screen.getByTestId("loc").textContent).toBe("/machine");
  });

  it("highlights the active top-level entry via aria-current", () => {
    render(
      <MemoryRouter initialEntries={["/machine"]}>
        <AppLayout />
      </MemoryRouter>,
    );
    expect(
      screen.getByText("Machine").closest('[role="link"]')?.getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByText("Marketplace").closest('[role="link"]')?.getAttribute("aria-current"),
    ).toBeNull();
  });

  it("expands a section's children while it is active", () => {
    render(
      <MemoryRouter initialEntries={["/harness/file"]}>
        <AppLayout />
      </MemoryRouter>,
    );
    const profile = NAV.find((e) => e.id === "profile")!;
    for (const child of profile.children ?? []) {
      expect(screen.getByText(child.label)).toBeInTheDocument();
    }
  });
});

describe("titlebar drag", () => {
  it("calls startDragging on mousedown in the drag region", async () => {
    mockStartDragging.mockClear();
    renderLayout();
    const titlebar = document.querySelector(".titlebar") as HTMLElement;
    fireEvent.mouseDown(titlebar);
    await vi.waitFor(() => expect(mockStartDragging).toHaveBeenCalledTimes(1));
  });

  it("does not call startDragging when mousedown is on a button", async () => {
    mockStartDragging.mockClear();
    renderLayout();
    const buttons = document.querySelectorAll(".titlebar-btn");
    fireEvent.mouseDown(buttons[0]);
    await new Promise((r) => setTimeout(r, 0));
    expect(mockStartDragging).not.toHaveBeenCalled();
  });
});

describe("title-bar project selector (AC-17)", () => {
  function selector() {
    return screen.getByRole("button", { name: /^Project:/ });
  }

  beforeEach(() => {
    mockStartDragging.mockClear();
    mockGrantProjectScope.mockClear();
    vi.mocked(openDialog).mockReset();
  });

  it("says No project when none is set, and grants nothing", () => {
    renderLayout();
    expect(selector()).toHaveTextContent("No project");
    expect(selector()).toHaveAttribute("aria-haspopup", "menu");
    expect(selector()).toHaveAttribute("aria-expanded", "false");
    expect(mockGrantProjectScope).not.toHaveBeenCalled();
  });

  it("shows the restored project's folder name, full path in the tooltip, and grants it at launch", () => {
    localStorage.setItem("harness-kit-sync-recent-dirs", JSON.stringify(["/Users/me/repos/app"]));
    renderLayout();
    expect(selector()).toHaveTextContent("app");
    expect(selector()).toHaveAttribute("title", "/Users/me/repos/app");
    expect(mockGrantProjectScope).toHaveBeenCalledWith("/Users/me/repos/app");
  });

  it("Choose folder… sets the project through lib/project-dir.ts", async () => {
    vi.mocked(openDialog).mockResolvedValue("/Users/me/repos/picked");
    renderLayout();
    fireEvent.click(selector());
    fireEvent.click(screen.getByRole("menuitem", { name: "Choose folder…" }));

    await waitFor(() => expect(selector()).toHaveTextContent("picked"));
    expect(openDialog).toHaveBeenCalledWith(expect.objectContaining({ directory: true }));
    expect(getCurrentProjectDir()).toBe("/Users/me/repos/picked");
    expect(getRecentProjectDirs()[0]).toBe("/Users/me/repos/picked");
    expect(mockGrantProjectScope).toHaveBeenCalledWith("/Users/me/repos/picked");
  });

  it("a cancelled dialog changes nothing", async () => {
    vi.mocked(openDialog).mockResolvedValue(null);
    renderLayout();
    fireEvent.click(selector());
    fireEvent.click(screen.getByRole("menuitem", { name: "Choose folder…" }));
    await waitFor(() => expect(openDialog).toHaveBeenCalled());
    expect(selector()).toHaveTextContent("No project");
    expect(getCurrentProjectDir()).toBeNull();
  });

  it("lists recent projects, and picking one makes it current", () => {
    localStorage.setItem("harness-kit-sync-recent-dirs", JSON.stringify(["/r/current", "/r/older"]));
    renderLayout();
    fireEvent.click(selector());
    const recent = screen.getByRole("group", { name: "Recent projects" });
    // The current project is not offered again.
    expect(recent).not.toHaveTextContent("/r/current");
    fireEvent.click(screen.getByRole("menuitem", { name: "older, /r/older" }));
    expect(getCurrentProjectDir()).toBe("/r/older");
    expect(selector()).toHaveTextContent("older");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("Clear resets to No project and keeps the recent list", () => {
    localStorage.setItem("harness-kit-sync-recent-dirs", JSON.stringify(["/r/current"]));
    renderLayout();
    fireEvent.click(selector());
    fireEvent.click(screen.getByRole("menuitem", { name: "Clear" }));
    expect(selector()).toHaveTextContent("No project");
    expect(getCurrentProjectDir()).toBeNull();
    expect(getRecentProjectDirs()).toEqual(["/r/current"]);
    // No Clear to offer once there is nothing to clear.
    fireEvent.click(selector());
    expect(screen.queryByRole("menuitem", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("opens on the first item, moves with arrows, and Escape closes and returns focus", () => {
    localStorage.setItem("harness-kit-sync-recent-dirs", JSON.stringify(["/r/current", "/r/older"]));
    renderLayout();
    fireEvent.click(selector());
    expect(selector()).toHaveAttribute("aria-expanded", "true");
    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.getAttribute("aria-label") ?? item.textContent)).toEqual([
      "Choose folder…",
      "older, /r/older",
      "Clear",
    ]);
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(items[0], { key: "ArrowDown" });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(items[1], { key: "ArrowUp" });
    fireEvent.keyDown(items[0], { key: "ArrowUp" });
    expect(items[2]).toHaveFocus();

    fireEvent.keyDown(items[2], { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(selector()).toHaveAttribute("aria-expanded", "false");
    expect(selector()).toHaveFocus();
  });

  it("closes on a click outside", () => {
    renderLayout();
    fireEvent.click(selector());
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("pressing the selector or its menu never starts a window drag", async () => {
    renderLayout();
    fireEvent.mouseDown(selector());
    fireEvent.click(selector());
    fireEvent.mouseDown(screen.getByRole("menu"));
    fireEvent.mouseDown(screen.getByRole("menuitem", { name: "Choose folder…" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(mockStartDragging).not.toHaveBeenCalled();
  });
});
