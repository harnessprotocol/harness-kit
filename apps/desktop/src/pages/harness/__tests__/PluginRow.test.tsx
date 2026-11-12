import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PluginRow from "../plugins/PluginRow";

// AC-61: a plugin row is reachable and operable from the keyboard, and its
// context menu is a menu button, not a right-click-only gesture.
const plugin = { name: "demo", version: "1.0.0", description: "A demo plugin" };

function setup(extra: { menuOpen?: boolean } = {}) {
  const onClick = vi.fn();
  const onContextMenu = vi.fn();
  render(<PluginRow plugin={plugin} index={0} isLast onClick={onClick} onContextMenu={onContextMenu} {...extra} />);
  return { onClick, onContextMenu };
}

describe("PluginRow keyboard", () => {
  it("opens the plugin from its name with Enter and Space", async () => {
    const user = userEvent.setup();
    const { onClick } = setup();
    await user.tab();
    expect(screen.getByRole("button", { name: "demo" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("has a menu button that announces the menu and its state", () => {
    setup({ menuOpen: true });
    const actions = screen.getByRole("button", { name: "Actions for demo" });
    expect(actions).toHaveAttribute("aria-haspopup", "menu");
    expect(actions).toHaveAttribute("aria-expanded", "true");
  });

  it("opens the menu from the keyboard without opening the plugin", async () => {
    const user = userEvent.setup();
    const { onClick, onContextMenu } = setup();
    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "Actions for demo" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onContextMenu).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();
  });
});
