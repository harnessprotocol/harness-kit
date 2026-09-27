import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
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

describe("CommandPalette highlight", () => {
  it("keeps the highlighted command when commands are registered above it while open", () => {
    const onGrown = vi.fn();
    // Mounted before the page, so its commands list above the page's.
    function Grows({ grown }: { grown: boolean }) {
      useRegisterCommands(grown ? [{ id: "grown", title: "Grown alpha thing", run: onGrown }] : [], [grown]);
      return null;
    }
    function Tree({ grown }: { grown: boolean }) {
      return (
        <MemoryRouter initialEntries={["/alpha"]}>
          <Grows grown={grown} />
          <Routes>
            <Route path="/alpha" element={<AlphaPage />} />
          </Routes>
          <CommandPalette open onClose={() => {}} sections={SECTIONS} />
        </MemoryRouter>
      );
    }
    onAlphaAction.mockClear();
    const view = render(<Tree grown={false} />);
    const input = screen.getByRole("textbox", { name: "Command palette search" });
    fireEvent.change(input, { target: { value: "alpha thing" } });
    // Highlight "Do the alpha thing" explicitly (down to "Blocked…", back up).
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowUp" });

    view.rerender(<Tree grown />);
    expect(within(screen.getByRole("dialog")).getAllByRole("button")[0]).toHaveTextContent("Grown alpha thing");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onGrown).not.toHaveBeenCalled();
    expect(onAlphaAction).toHaveBeenCalledTimes(1);
  });
});

describe("CommandPalette focus", () => {
  const TARGET_FOCUS = "focus the notes field";

  function FocusPage() {
    useRegisterCommands(
      [{ id: "focus.notes", title: TARGET_FOCUS, run: () => document.getElementById("notes")?.focus() }],
      [],
    );
    return <textarea id="notes" aria-label="Notes" />;
  }

  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <MemoryRouter>
        <FocusPage />
        <button type="button" onClick={() => setOpen(true)}>
          open palette
        </button>
        <CommandPalette open={open} onClose={() => setOpen(false)} sections={SECTIONS} />
      </MemoryRouter>
    );
  }

  async function openFromTrigger() {
    const trigger = screen.getByRole("button", { name: "open palette" });
    trigger.focus();
    fireEvent.click(trigger);
    const input = screen.getByRole("textbox", { name: "Command palette search" });
    await waitFor(() => expect(input).toHaveFocus());
    return { trigger, input };
  }

  it("Escape returns focus to what had it before the palette opened", async () => {
    render(<Harness />);
    const { trigger, input } = await openFromTrigger();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("a command that moves focus keeps it", async () => {
    render(<Harness />);
    const { input } = await openFromTrigger();
    fireEvent.change(input, { target: { value: "notes field" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveFocus();
  });
});
