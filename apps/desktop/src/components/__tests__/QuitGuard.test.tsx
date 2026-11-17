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
const quitRequestSeen = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const setUnsavedDrafts = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const writeHarnessFile = vi.hoisted(() => vi.fn());
vi.mock("../../lib/tauri", () => ({
  confirmQuit,
  quitRequestSeen,
  setUnsavedDrafts,
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
    confirmQuit.mockReset();
    confirmQuit.mockResolvedValue(undefined);
    quitRequestSeen.mockClear();
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
    fireEvent.click(screen.getByRole("button", { name: "Save All" }));
    await waitFor(() => expect(confirmQuit).toHaveBeenCalledTimes(1));
    expect(writeHarnessFile).toHaveBeenCalledTimes(1);
    expect(getProfileDraft(PATH)).toBeUndefined();
  });

  it("a failed save keeps the app open, keeps the draft and shows the reason", async () => {
    writeHarnessFile.mockRejectedValue("file changed on disk");
    setProfileDraft(PATH, { buffer: "b", synced: "s" });
    await mountAndRequestQuit();
    fireEvent.click(screen.getByRole("button", { name: "Save All" }));
    await screen.findByText(/file changed on disk/);
    expect(confirmQuit).not.toHaveBeenCalled();
    expect(getProfileDraft(PATH)).toBeDefined();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("Discard drops the drafts and quits", async () => {
    setProfileDraft(PATH, { buffer: "b", synced: "s" });
    await mountAndRequestQuit();
    fireEvent.click(screen.getByRole("button", { name: "Don't Save" }));
    await waitFor(() => expect(confirmQuit).toHaveBeenCalledTimes(1));
    expect(getProfileDraft(PATH)).toBeUndefined();
  });

  it("acknowledges the quit request so Rust does not force-quit", async () => {
    await mountAndRequestQuit();
    expect(quitRequestSeen).toHaveBeenCalledTimes(1);
  });

  it("lists Don't Save first, then Cancel, then Save All", async () => {
    setProfileDraft(PATH, { buffer: "b", synced: "s" });
    await mountAndRequestQuit();
    const labels = screen.getAllByRole("button").map((b) => b.textContent).filter((t) => t !== "");
    expect(labels).toEqual(["Don't Save", "Cancel", "Save All"]);
  });

  it("Return triggers Save All", async () => {
    writeHarnessFile.mockResolvedValue(PATH);
    setProfileDraft(PATH, { buffer: "b", synced: "s" });
    await mountAndRequestQuit();
    fireEvent.keyDown(window, { key: "Enter" });
    await waitFor(() => expect(confirmQuit).toHaveBeenCalledTimes(1));
    expect(writeHarnessFile).toHaveBeenCalledTimes(1);
  });

  it("Escape is ignored while saving", async () => {
    let finish: (v: string) => void = () => {};
    writeHarnessFile.mockReturnValue(new Promise<string>((r) => { finish = r; }));
    setProfileDraft(PATH, { buffer: "b", synced: "s" });
    await mountAndRequestQuit();
    fireEvent.click(screen.getByRole("button", { name: "Save All" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    await act(async () => { finish(PATH); });
    await waitFor(() => expect(confirmQuit).toHaveBeenCalled());
  });

  it("shows the reason when quitting is refused, instead of an unhandled rejection", async () => {
    confirmQuit.mockRejectedValue("exit refused");
    setProfileDraft(PATH, { buffer: "b", synced: "s" });
    await mountAndRequestQuit();
    fireEvent.click(screen.getByRole("button", { name: "Don't Save" }));
    await screen.findByText(/exit refused/);
    expect(screen.getByRole("dialog")).toBeTruthy();
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
