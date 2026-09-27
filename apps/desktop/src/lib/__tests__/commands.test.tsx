import { afterEach, describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { registerCommands as registerInRegistry, useCommands, useRegisterCommands, type PageCommand } from "../commands";

// Direct registrations are module state: remove any a failed test left behind.
const pending: (() => void)[] = [];
function registerCommands(commands: PageCommand[]) {
  const unregister = registerInRegistry(commands);
  pending.push(unregister);
  return unregister;
}
afterEach(() => {
  act(() => {
    for (const unregister of pending.splice(0)) unregister();
  });
});

/** Renders the registry's current list, and records every list it was given. */
function Listing({ seen }: { seen?: (readonly PageCommand[])[] }) {
  const commands = useCommands();
  seen?.push(commands);
  return <div data-testid="listing">{commands.map((command) => `${command.id}:${command.title}`).join("|")}</div>;
}

function listing() {
  return screen.getByTestId("listing").textContent;
}

function run(id: string) {
  // The registry's own entry, i.e. what the palette would call.
  let found: PageCommand | undefined;
  function Probe() {
    found = useCommands().find((command) => command.id === id);
    return null;
  }
  const probe = render(<Probe />);
  probe.unmount();
  if (!found) throw new Error(`no command ${id}`);
  return found.run();
}

describe("registerCommands", () => {
  it("lists commands until the returned function removes them", () => {
    render(<Listing />);
    let unregister = () => {};
    act(() => {
      unregister = registerCommands([{ id: "a", title: "A", run: () => {} }]);
    });
    expect(listing()).toBe("a:A");
    act(() => unregister());
    expect(listing()).toBe("");
    // A second call is harmless.
    act(() => unregister());
    expect(listing()).toBe("");
  });

  it("duplicate ids: the latest registration wins, and the earlier one returns when it goes", () => {
    render(<Listing />);
    let first = () => {};
    let second = () => {};
    act(() => {
      first = registerCommands([
        { id: "x", title: "first x", run: () => {} },
        { id: "y", title: "y", run: () => {} },
      ]);
    });
    act(() => {
      second = registerCommands([{ id: "x", title: "second x", run: () => {} }]);
    });
    // One entry per id, placed where the winning registration puts it.
    expect(listing()).toBe("y:y|x:second x");
    act(() => second());
    expect(listing()).toBe("x:first x|y:y");
    act(() => first());
    expect(listing()).toBe("");
  });
});

describe("useRegisterCommands", () => {
  function Page({ onRun }: { onRun: (count: number) => void }) {
    const [count, setCount] = useState(0);
    useRegisterCommands([{ id: "page.report", title: "Report", run: () => onRun(count) }], []);
    return (
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        count {count}
      </button>
    );
  }

  it("registers while mounted and unregisters on unmount", () => {
    render(<Listing />);
    const page = render(<Page onRun={() => {}} />);
    expect(listing()).toBe("page.report:Report");
    page.unmount();
    expect(listing()).toBe("");
  });

  it("runs the latest closure without re-registering on every render", () => {
    const seen: (readonly PageCommand[])[] = [];
    render(<Listing seen={seen} />);
    const onRun = vi.fn();
    render(<Page onRun={onRun} />);
    const listsBefore = new Set(seen).size;

    fireEvent.click(screen.getByRole("button", { name: "count 0" }));
    fireEvent.click(screen.getByRole("button", { name: "count 1" }));
    // The page re-rendered twice with new closures; the registry did not change.
    expect(new Set(seen).size).toBe(listsBefore);

    run("page.report");
    expect(onRun).toHaveBeenCalledWith(2);
  });

  it("rebuilds the list when a dep changes, and a command the latest render disabled does not run", () => {
    function Toggle({ onRun }: { onRun: () => void }) {
      const [busy, setBusy] = useState(false);
      useRegisterCommands([{ id: "t", title: busy ? "Busy" : "Go", disabled: busy, run: onRun }], [busy]);
      return (
        <button type="button" onClick={() => setBusy(true)}>
          busy
        </button>
      );
    }
    const onRun = vi.fn();
    render(<Listing />);
    render(<Toggle onRun={onRun} />);
    expect(listing()).toBe("t:Go");
    fireEvent.click(screen.getByRole("button", { name: "busy" }));
    expect(listing()).toBe("t:Busy");
    run("t");
    expect(onRun).not.toHaveBeenCalled();
  });

  it("a later-mounted page takes over a shared id until it unmounts", () => {
    function Registers({ title }: { title: string }) {
      useRegisterCommands([{ id: "shared", title, run: () => {} }], [title]);
      return null;
    }
    render(<Listing />);
    render(<Registers title="app" />);
    const page = render(<Registers title="page" />);
    expect(listing()).toBe("shared:page");
    page.unmount();
    expect(listing()).toBe("shared:app");
  });
});
