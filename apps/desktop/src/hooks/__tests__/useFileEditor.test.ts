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
  // The digest of what was loaded is computed first, so the write is async.
  await waitFor(() => expect(mockWrite).toHaveBeenCalledWith(OLD, "old edited", expect.any(String)));

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

describe("useFileEditor: AC-50 changed-on-disk check", () => {
  const HELLO_SHA = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

  beforeEach(() => {
    vi.clearAllMocks();
    mockRead.mockResolvedValue("hello");
  });

  it("sends the digest of the content it loaded", async () => {
    mockWrite.mockResolvedValue(undefined);
    const hook = renderHook(() => useFileEditor(OLD));
    await waitFor(() => expect(hook.result.current.content).toBe("hello"));
    act(() => hook.result.current.updateContent("hello world"));
    await act(async () => { await hook.result.current.saveFile(); });
    expect(mockWrite).toHaveBeenCalledWith(OLD, "hello world", HELLO_SHA);
  });

  it("explains a changed-on-disk refusal and keeps the edits", async () => {
    mockWrite.mockRejectedValue("Refusing to write 'x': it changed on disk since it was read");
    const hook = renderHook(() => useFileEditor(OLD));
    await waitFor(() => expect(hook.result.current.content).toBe("hello"));
    act(() => hook.result.current.updateContent("mine"));
    await act(async () => { await hook.result.current.saveFile(); });
    expect(hook.result.current.saveErrorTitle).toMatch(/changed on disk/);
    expect(hook.result.current.saveError).toMatch(/changed on disk/);
    expect(hook.result.current.content).toBe("mine");
    expect(hook.result.current.isDirty).toBe(true);
  });
});
