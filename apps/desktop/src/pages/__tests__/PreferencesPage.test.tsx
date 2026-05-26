import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn(),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn(() => Promise.resolve("1.2.3")),
}));

vi.mock("../../lib/theme", () => ({
  getTheme: vi.fn(() => "system"),
  setTheme: vi.fn(),
}));

vi.mock("../../lib/preferences", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/preferences")>();
  return {
    ...actual,
    getConfigFilesDetailLevel: vi.fn(() => "text-files"),
    setConfigFilesDetailLevel: vi.fn(),
  };
});

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

  it("renders all 7 section headers", () => {
    renderPage();
    for (const heading of ["Appearance", "Layout", "Behavior", "Content", "Config File Explorer", "Labs", "About"]) {
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

  it("renders dynamic version from Tauri", async () => {
    renderPage();
    expect(await screen.findByText("v1.2.3")).toBeInTheDocument();
  });

  it('renders "Release notes" and "GitHub" links', () => {
    renderPage();
    expect(screen.getByText("Release notes")).toBeInTheDocument();
    expect(screen.getByText("GitHub")).toBeInTheDocument();
  });

  it("renders the Config File Explorer section", () => {
    render(<MemoryRouter><PreferencesPage /></MemoryRouter>);
    expect(screen.getByText("Config File Explorer")).toBeInTheDocument();
    expect(screen.getByText("File visibility")).toBeInTheDocument();
  });
});
