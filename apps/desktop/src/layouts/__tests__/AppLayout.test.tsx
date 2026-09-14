import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import AppLayout from "../AppLayout";
import { NAV, visibleNav } from "../../nav";

// ── Mocks ─────────────────────────────────────────────────────

const mockStartDragging = vi.fn().mockResolvedValue(undefined);
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({ startDragging: mockStartDragging })),
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
