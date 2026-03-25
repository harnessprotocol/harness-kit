import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AppLayout, { NAV_SECTIONS } from "../AppLayout";
import { NAV_PATHS } from "../../hooks/useGlobalShortcuts";

// ── Mocks ─────────────────────────────────────────────────────

vi.mock("../../context/ChatContext", () => ({
  useChat: () => ({ state: { status: "disconnected" }, isOpen: false, setOpen: vi.fn(), unreadCount: 0 }),
  ChatProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockStartDragging = vi.fn().mockResolvedValue(undefined);
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({ startDragging: mockStartDragging })),
}));

// Tauri APIs used by theme lib must not throw in jsdom
vi.mock("../../lib/theme", () => ({
  initTheme: vi.fn(),
  getTheme: vi.fn(() => "system"),
  setTheme: vi.fn(),
  getAccent: vi.fn(() => "blue"),
  setAccent: vi.fn(),
  ACCENT_PRESETS: {
    blue: { label: "Blue", swatch: "#5b50e8" },
  },
}));

vi.mock("../../lib/preferences", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/preferences")>();
  return {
    ...actual,
    initPreferences: vi.fn(),
    getHiddenSections: vi.fn(() => new Set()),
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

describe("NAV alignment", () => {
  it("NAV_SECTIONS and NAV_PATHS have matching lengths", () => {
    expect(NAV_SECTIONS.length).toBe(NAV_PATHS.length);
  });
});

describe("sidebar renders all nav sections", () => {
  it("renders every section label", () => {
    renderLayout();
    for (const section of NAV_SECTIONS) {
      expect(screen.getByText(section.label)).toBeInTheDocument();
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
