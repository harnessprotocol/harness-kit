import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useFileEditor } from "../useFileEditor";

const mockRead = vi.fn();
const mockWrite = vi.fn();
vi.mock("../../lib/tauri", () => ({
  readClaudeMd: (...args: unknown[]) => mockRead(...args),
  writeConfigFile: (...args: unknown[]) => mockWrite(...args),
}));

const OLD = "~/.claude/old.md";
const NEW = "~/.claude/new.md";

/** Edits OLD, starts a save that stays in flight, then moves to NEW. */
async function saveThenSwitch() {
  let settle: { resolve: () => void; reject: (e: Error) => void } = {
    resolve: () => {}, reject: () => {},
  };
  mockWrite.mockImplementationOnce(() => new Promise<void>((resolve, reject) => {
    settle = { resolve, reject };
  }));
  const hook = renderHook(({ path }) => useFileEditor(path), { initialProps: { path: OLD } });
  await waitFor(() => expect(hook.result.current.content).toBe("old content"));
  act(() => hook.result.current.updateContent("old edited"));
  let saving: Promise<void> = Promise.resolve();
  act(() => { saving = hook.result.current.saveFile(); });
  expect(mockWrite).toHaveBeenCalledWith(OLD, "old edited");

  hook.rerender({ path: NEW });
  await waitFor(() => expect(hook.result.current.content).toBe("new content"));
  return { hook, settle, saving: () => saving };
}

describe("useFileEditor: a save that settles after the file changed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRead.mockImplementation(async (path: string) => (path === OLD ? "old content" : "new content"));
  });

  it("does not put the old file's failure on the new file", async () => {
    const { hook, settle, saving } = await saveThenSwitch();

    await act(async () => {
      settle.reject(new Error("read-only file system"));
      await saving();
    });

    expect(hook.result.current.saveError).toBeNull();
    expect(hook.result.current.content).toBe("new content");
    expect(hook.result.current.isDirty).toBe(false);
  });

  it("does not take the old file's saved content as the new file's original", async () => {
    const { hook, settle, saving } = await saveThenSwitch();

    await act(async () => {
      settle.resolve();
      await saving();
    });

    expect(hook.result.current.originalContent).toBe("new content");
    expect(hook.result.current.isDirty).toBe(false);
    expect(hook.result.current.savedRecently).toBe(false);
  });
});
