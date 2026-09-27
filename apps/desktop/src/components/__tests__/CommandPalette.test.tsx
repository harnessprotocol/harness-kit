import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { FileCode, Monitor } from "lucide-react";
import { CommandPalette, PAGE_GROUP } from "../CommandPalette";
import { useRegisterCommands } from "../../lib/commands";
import type { NavEntry } from "../../nav";

const SECTIONS: NavEntry[] = [
  { id: "alpha", label: "Alpha", path: "/alpha", icon: Monitor },
  { id: "beta", label: "Beta", path: "/beta", icon: FileCode },
];

const onAlphaAction = vi.fn();
const onBlocked = vi.fn();

function AlphaPage() {
  useRegisterCommands(
    [
      { id: "alpha.act", title: "Do the alpha thing", group: "Alpha", keywords: ["frobnicate"], run: onAlphaAction },
      { id: "alpha.blocked", title: "Blocked alpha thing", group: "Alpha", disabled: true, run: onBlocked },
      // Takes over the palette's app-wide command of the same id.
      { id: "toggle-theme", title: "Alpha's own theme toggle", group: "Alpha", run: () => {} },
    ],
    [],
  );
  return <div>alpha page</div>;
}

function BetaPage() {
  return <div>beta page</div>;
}

function renderAt(path: string, onClose = vi.fn()) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/alpha" element={<AlphaPage />} />
        <Route path="/beta" element={<BetaPage />} />
      </Routes>
      <CommandPalette open onClose={onClose} sections={SECTIONS} />
    </MemoryRouter>,
  );
  return onClose;
}

function option(name: string | RegExp) {
  return within(screen.getByRole("dialog", { name: "Command palette" })).getByRole("button", { name });
}

function queryOption(name: string | RegExp) {
  return within(screen.getByRole("dialog", { name: "Command palette" })).queryByRole("button", { name });
}

describe("CommandPalette page commands (AC-21)", () => {
  it("lists a page's commands first, under This page, only while that page is mounted", () => {
    renderAt("/alpha");
    const dialog = screen.getByRole("dialog", { name: "Command palette" });
    const labels = within(dialog).getAllByRole("button").map((button) => button.textContent);
    expect(labels[0]).toBe("Do the alpha thing");
    expect(within(dialog).getByText(PAGE_GROUP)).toBeInTheDocument();

    // Navigate away through the palette's own navigation command.
    fireEvent.click(option("Go to Beta"));
    expect(screen.getByText("beta page")).toBeInTheDocument();
    expect(queryOption("Do the alpha thing")).not.toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).queryByText(PAGE_GROUP)).not.toBeInTheDocument();
  });

  it("runs a page command and closes", () => {
    onAlphaAction.mockClear();
    const onClose = renderAt("/alpha");
    fireEvent.click(option("Do the alpha thing"));
    expect(onAlphaAction).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it("finds a page command by its keywords and runs it with Enter", () => {
    onAlphaAction.mockClear();
    renderAt("/alpha");
    const input = screen.getByRole("textbox", { name: "Command palette search" });
    fireEvent.change(input, { target: { value: "frobni" } });
    expect(option("Do the alpha thing")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAlphaAction).toHaveBeenCalledTimes(1);
  });

  it("shows a disabled page command as disabled, and neither click nor Enter runs it", () => {
    onBlocked.mockClear();
    const onClose = renderAt("/alpha");
    const blocked = option("Blocked alpha thing");
    expect(blocked).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(blocked);

    const input = screen.getByRole("textbox", { name: "Command palette search" });
    fireEvent.change(input, { target: { value: "blocked" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onBlocked).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("a page command replaces the app-wide command with the same id while the page is open", () => {
    renderAt("/alpha");
    expect(option("Alpha's own theme toggle")).toBeInTheDocument();
    expect(queryOption("Toggle light / dark theme")).not.toBeInTheDocument();

    fireEvent.click(option("Go to Beta"));
    expect(option("Toggle light / dark theme")).toBeInTheDocument();
  });
});
