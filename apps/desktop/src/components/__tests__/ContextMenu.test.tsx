import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import ContextMenu from "../ContextMenu";

// AC-61: the menu is a real menu — focus moves in, arrows move between items,
// Escape closes and gives focus back to what opened it.
function Host({ onCopy = vi.fn(), onRemove = vi.fn() }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Actions</button>
      {open && (
        <ContextMenu
          x={10}
          y={10}
          onClose={() => setOpen(false)}
          items={[
            { label: "Copy name", onClick: onCopy },
            { separator: true },
            { label: "Uninstall", onClick: onRemove, danger: true },
          ]}
        />
      )}
    </>
  );
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Actions" }));
  const menu = screen.getByRole("menu");
  await waitFor(() => expect(screen.getByRole("menuitem", { name: "Copy name" })).toHaveFocus());
  return menu;
}

describe("ContextMenu", () => {
  it("is role=menu with menuitems and a separator, and focuses the first item", async () => {
    const user = userEvent.setup();
    render(<Host />);
    const menu = await openMenu(user);
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    expect(menu.querySelector('[role="separator"]')).not.toBeNull();
  });

  it("moves with the arrow keys, wrapping, and Home/End", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await openMenu(user);
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Uninstall" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Copy name" })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Uninstall" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("menuitem", { name: "Copy name" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Uninstall" })).toHaveFocus();
  });

  it("activates the focused item with Enter and closes", async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(<Host onRemove={onRemove} />);
    await openMenu(user);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onRemove).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("returns focus to the opener on Escape", async () => {
    const user = userEvent.setup();
    render(<Host />);
    const opener = screen.getByRole("button", { name: "Actions" });
    await openMenu(user);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("closes on Tab instead of leaving focus behind a hidden menu", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await openMenu(user);
    await user.tab();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
