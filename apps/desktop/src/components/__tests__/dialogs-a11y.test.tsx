import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));
vi.mock("../../lib/tauri", () => ({
  getSystemInfo: vi.fn().mockResolvedValue({}),
  submitFeedback: vi.fn(),
  listCustomProfiles: vi.fn().mockResolvedValue([]),
  getCustomProfile: vi.fn(),
  deleteCustomProfile: vi.fn(),
}));

import FeedbackModal from "../FeedbackModal";
import ProfilePickerModal from "../ProfilePickerModal";

// AC-61: FeedbackModal and ProfilePickerModal are real dialogs.
function Host({ which }: { which: "feedback" | "profiles" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Launch</button>
      {which === "feedback" ? (
        <FeedbackModal open={open} onClose={() => setOpen(false)} />
      ) : (
        <ProfilePickerModal open={open} onClose={() => setOpen(false)} onSelect={() => {}} />
      )}
    </>
  );
}

describe.each([
  ["feedback", "Send Feedback"],
  ["profiles", "Choose a profile"],
] as const)("%s dialog", (which, name) => {
  it("is a named modal dialog that takes focus", async () => {
    const user = userEvent.setup();
    render(<Host which={which} />);
    await user.click(screen.getByRole("button", { name: "Launch" }));
    const dialog = await screen.findByRole("dialog", { name });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    await waitFor(() => expect(dialog).toHaveFocus());
  });

  it("traps Tab and returns focus to the trigger on Escape or close", async () => {
    const user = userEvent.setup();
    render(<Host which={which} />);
    const trigger = screen.getByRole("button", { name: "Launch" });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", { name });
    await waitFor(() => expect(dialog).toHaveFocus());
    for (let i = 0; i < 40; i++) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});

describe("feedback dialog close control", () => {
  it("labels the icon-only close button", async () => {
    const user = userEvent.setup();
    render(<Host which="feedback" />);
    await user.click(screen.getByRole("button", { name: "Launch" }));
    expect(await screen.findByRole("button", { name: "Close" })).toBeInTheDocument();
  });
});
