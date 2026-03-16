import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AppLayout, { NAV_SECTIONS } from "../AppLayout";
import { NAV_PATHS } from "../../hooks/useGlobalShortcuts";

// ── Mocks ─────────────────────────────────────────────────────

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
  it("sidebar has position: fixed", () => {
    renderLayout();
    const aside = document.querySelector("aside");
    expect(aside).not.toBeNull();
    expect(aside!.style.position).toBe("fixed");
  });

  it("sidebar has backdropFilter with blur", () => {
    renderLayout();
    const aside = document.querySelector("aside");
    expect(aside!.style.backdropFilter).toMatch(/blur/);
  });

  it("main content has paddingLeft set to sidebar-width variable", () => {
    renderLayout();
    const main = document.querySelector("main");
    expect(main!.style.paddingLeft).toBe("var(--sidebar-width)");
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
