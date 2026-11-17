import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcessResult } from "@harness-kit/core";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { TauriProcessRunner } from "../process-runner";

describe("TauriProcessRunner", () => {
  beforeEach(() => invoke.mockReset());

  it("sends command, args and a null cwd when none is given", async () => {
    invoke.mockResolvedValue({ status: "ok", exitCode: 0, stdout: "", stderr: "" });
    await new TauriProcessRunner().run({ command: "claude", args: ["plugin", "install", "a@b"] });
    expect(invoke).toHaveBeenCalledWith("run_plugin_installer", {
      command: "claude",
      args: ["plugin", "install", "a@b"],
      cwd: null,
    });
  });

  it("passes cwd through and drops env and timeoutMs", async () => {
    invoke.mockResolvedValue({ status: "ok", exitCode: 0, stdout: "", stderr: "" });
    await new TauriProcessRunner().run({
      command: "codex",
      args: ["plugin", "add", "a@b"],
      cwd: "/p",
      env: { X: "1" },
      timeoutMs: 5,
    });
    expect(invoke).toHaveBeenCalledWith("run_plugin_installer", {
      command: "codex",
      args: ["plugin", "add", "a@b"],
      cwd: "/p",
    });
  });

  it.each<ProcessResult>([
    { status: "ok", exitCode: 2, stdout: "o", stderr: "e" },
    { status: "spawn-failed", reason: "refused: binary \"sh\" is not an allowed installer" },
    { status: "timed-out", stdout: "o", stderr: "e", timeoutMs: 180000 },
  ])("returns the $status result unchanged", async (result) => {
    invoke.mockResolvedValue(result);
    const got = await new TauriProcessRunner().run({ command: "claude", args: ["plugin", "install", "a@b"] });
    expect(got).toEqual(result);
  });

  it("which asks Rust for the binary and passes the answer through", async () => {
    invoke.mockResolvedValueOnce("/usr/local/bin/claude").mockResolvedValueOnce(null);
    const runner = new TauriProcessRunner();
    expect(await runner.which("claude")).toBe("/usr/local/bin/claude");
    expect(invoke).toHaveBeenCalledWith("which_plugin_installer", { binary: "claude" });
    expect(await runner.which("codex")).toBeNull();
  });
});
