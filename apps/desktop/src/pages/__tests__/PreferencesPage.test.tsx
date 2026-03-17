import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn(),
}));

vi.mock("../../lib/theme", () => ({
  getTheme: vi.fn(() => "system"),
  setTheme: vi.fn(),
  getAccent: vi.fn(() => "purple"),
  setAccent: vi.fn(),
  ACCENT_PRESETS: {
    purple: {
      label: "Purple",
      swatch: "#7c3aed",
      dark: { accent: "#7c3aed", light: "rgba(124,58,237,0.15)", text: "#a78bfa" },
      light: { accent: "#7c3aed", light: "rgba(124,58,237,0.10)", text: "#6d28d9" },
    },
    blue: {
      label: "Blue",
      swatch: "#2563eb",
      dark: { accent: "#2563eb", light: "rgba(37,99,235,0.15)", text: "#60a5fa" },
      light: { accent: "#2563eb", light: "rgba(37,99,235,0.10)", text: "#1d4ed8" },
    },
  },
}));

import PreferencesPage from "../PreferencesPage";

// ── Helpers ──────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter>
      <PreferencesPage />
    </MemoryRouter>,
  );
}

// ── Tests ────────────────────────────────────────────────────

describe("PreferencesPage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the page title", () => {
    renderPage();
    expect(screen.getByText("Preferences")).toBeInTheDocument();
  });

  it("renders all 5 section headers", () => {
    renderPage();
    for (const heading of ["Appearance", "Layout", "Behavior", "Content", "About"]) {
      expect(screen.getByText(heading)).toBeInTheDocument();
    }
  });

  it("increments font size when + is clicked", async () => {
    renderPage();
    const incrementBtn = screen.getByLabelText("Increase font size");
    expect(screen.getByText("13px")).toBeInTheDocument();

    await userEvent.click(incrementBtn);
    expect(screen.getByText("14px")).toBeInTheDocument();
  });

  it("decrements font size back after incrementing", async () => {
    renderPage();
    const incrementBtn = screen.getByLabelText("Increase font size");
    const decrementBtn = screen.getByLabelText("Decrease font size");

    await userEvent.click(incrementBtn);
    expect(screen.getByText("14px")).toBeInTheDocument();

    await userEvent.click(decrementBtn);
    expect(screen.getByText("13px")).toBeInTheDocument();
  });

  it("renders version text containing v0.1.0", () => {
    renderPage();
    expect(screen.getByText("v0.1.0")).toBeInTheDocument();
  });

  it('renders "Release notes" and "GitHub" links', () => {
    renderPage();
    expect(screen.getByText("Release notes")).toBeInTheDocument();
    expect(screen.getByText("GitHub")).toBeInTheDocument();
  });
});
