import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const handlers = vi.hoisted(() => ({ fn: null as null | (() => void) }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_name: string, cb: () => void) => {
    handlers.fn = cb;
    return () => {
      handlers.fn = null;
    };
  }),
}));

const confirmQuit = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const writeHarnessFile = vi.hoisted(() => vi.fn());
vi.mock("../../lib/tauri", () => ({
  confirmQuit,
  writeHarnessFile,
  isTauriRuntimeAvailable: () => true,
}));

import { QuitGuard } from "../QuitGuard";
import { clearAllProfileDrafts, getProfileDraft, setProfileDraft } from "../../lib/profile-draft";

const PATH = "~/.harness/harness.yaml";

async function mountAndRequestQuit() {
  render(<QuitGuard />);
  await waitFor(() => expect(handlers.fn).not.toBeNull());
  await act(async () => {
    handlers.fn!();
  });
}

describe("QuitGuard", () => {
  beforeEach(() => {
    localStorage.clear();
    clearAllProfileDrafts();
    confirmQuit.mockClear();
    writeHarnessFile.mockReset();
  });
  afterEach(() => clearAllProfileDrafts());

  it("quits at once, with no modal, when there are no drafts", async () => {
    await mountAndRequestQuit();
    expect(confirmQuit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the modal when drafts exist, and does not quit", async () => {
    setProfileDraft(PATH, { buffer: "b", synced: "s" });
    await mountAndRequestQuit();
    expect(confirmQuit).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Save changes before quitting?" })).toBeTruthy();
    expect(screen.getByText("You have unsaved changes in 1 file.")).toBeTruthy();
    expect(screen.getByText(PATH)).toBeTruthy();
  });

  it("Save all saves, then quits", async () => {
    writeHarnessFile.mockResolvedValue(PATH);
    setProfileDraft(PATH, { buffer: "b", synced: "s" });
    await mountAndRequestQuit();
    fireEvent.click(screen.getByRole("button", { name: "Save all" }));
    await waitFor(() => expect(confirmQuit).toHaveBeenCalledTimes(1));
    expect(writeHarnessFile).toHaveBeenCalledTimes(1);
    expect(getProfileDraft(PATH)).toBeUndefined();
  });

  it("a failed save keeps the app open, keeps the draft and shows the reason", async () => {
    writeHarnessFile.mockRejectedValue("file changed on disk");
    setProfileDraft(PATH, { buffer: "b", synced: "s" });
    await mountAndRequestQuit();
    fireEvent.click(screen.getByRole("button", { name: "Save all" }));
    await screen.findByText(/file changed on disk/);
    expect(confirmQuit).not.toHaveBeenCalled();
    expect(getProfileDraft(PATH)).toBeDefined();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("Discard drops the drafts and quits", async () => {
    setProfileDraft(PATH, { buffer: "b", synced: "s" });
    await mountAndRequestQuit();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(confirmQuit).toHaveBeenCalledTimes(1));
    expect(getProfileDraft(PATH)).toBeUndefined();
  });

  it("Cancel and Escape keep the app open and the drafts", async () => {
    setProfileDraft(PATH, { buffer: "b", synced: "s" });
    await mountAndRequestQuit();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => {
      handlers.fn!();
    });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(confirmQuit).not.toHaveBeenCalled();
    expect(getProfileDraft(PATH)).toBeDefined();
  });
});
