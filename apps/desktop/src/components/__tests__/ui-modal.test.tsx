import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Modal } from "@harness-kit/ui";

// AC-61: every modal traps focus while open and returns it to the trigger.
function Harness({ conditional = false }: { conditional?: boolean }) {
  const [open, setOpen] = useState(false);
  const modal = (
    <Modal open={open || conditional} onClose={() => setOpen(false)} title="Rename" footer={<button>Save</button>}>
      <input aria-label="Name" />
    </Modal>
  );
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      {conditional ? (open ? modal : null) : modal}
    </>
  );
}

async function openModal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Open" }));
  const dialog = await screen.findByRole("dialog", { name: "Rename" });
  await waitFor(() => expect(dialog).toHaveFocus());
  return dialog;
}

describe("@harness-kit/ui Modal focus", () => {
  it("moves focus into the dialog on open", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openModal(user);
  });

  it("keeps Tab inside the dialog, wrapping at both ends", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openModal(user);
    const close = screen.getByRole("button", { name: "Close dialog" });
    const input = screen.getByRole("textbox", { name: "Name" });
    const save = screen.getByRole("button", { name: "Save" });

    await user.tab();
    expect(close).toHaveFocus();
    await user.tab();
    expect(input).toHaveFocus();
    await user.tab();
    expect(save).toHaveFocus();
    await user.tab(); // past the last: wraps, never reaches the page behind
    expect(close).toHaveFocus();
    await user.tab({ shift: true }); // before the first: wraps to the last
    expect(save).toHaveFocus();
  });

  it("pulls focus back in when it is outside the dialog", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openModal(user);
    screen.getByRole("button", { name: "Open" }).focus();
    await user.tab();
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
  });

  it("returns focus to the trigger on Escape", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open" });
    await openModal(user);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("returns focus to the trigger when the parent unmounts the modal", async () => {
    const user = userEvent.setup();
    render(<Harness conditional />);
    const trigger = screen.getByRole("button", { name: "Open" });
    await openModal(user);
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("gives two open modals distinct title ids", async () => {
    render(
      <>
        <Modal open onClose={() => {}} title="First">
          a
        </Modal>
        <Modal open onClose={() => {}} title="Second">
          b
        </Modal>
      </>,
    );
    expect(screen.getByRole("dialog", { name: "First" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Second" })).toBeInTheDocument();
  });
});
