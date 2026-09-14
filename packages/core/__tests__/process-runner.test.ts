import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, chmod, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertSafeArgs,
  isFlagLike,
  UnsafeArgumentError,
} from "../src/process-runner.js";
import { NodeProcessRunner } from "../src/process-node.js";

/**
 * The process seam runs third-party binaries with arguments derived from
 * files other tools wrote. These tests are about the two structural
 * guarantees that makes survivable — no shell, and no argument that reads as
 * a flag — plus the result contract callers branch on.
 */

const runner = new NodeProcessRunner();

/** Written as an escape, never as a literal byte: a raw NUL in a source file
 * is invisible in an editor and survives edits nobody can see. */
const NUL = "\u0000";

describe("assertSafeArgs (argv injection)", () => {
  it("rejects a value that would be read as an option", () => {
    // A shell is not the only injection target. Under argv, `--config` as a
    // plugin NAME still becomes a flag to `claude plugin install`.
    for (const bad of ["--config", "-s", "--", "-", "--scope=user"]) {
      expect(() => assertSafeArgs([bad]), bad).toThrow(UnsafeArgumentError);
    }
  });

  it("rejects an empty argument and one carrying a NUL", () => {
    expect(() => assertSafeArgs([""])).toThrow(UnsafeArgumentError);
    // execve truncates at NUL, so anything past it would be invisible in the
    // command we think we ran and in the error we show.
    expect(() => assertSafeArgs([`ok${NUL}--config=x`])).toThrow(UnsafeArgumentError);
  });

  it("accepts real plugin identities, including scoped names", () => {
    expect(() =>
      assertSafeArgs(["board@harness-kit", "@acme/toolkit@harness-kit", "a_b.c-d@m"]),
    ).not.toThrow();
  });

  it("names the offending argument in the error", () => {
    expect(() => assertSafeArgs(["--config"])).toThrow(/"--config"/);
  });

  it("isFlagLike is the single rule the assertion uses", () => {
    expect(isFlagLike("-x")).toBe(true);
    expect(isFlagLike("x-")).toBe(false);
  });
});

describe("NodeProcessRunner: no shell", () => {
  it("passes metacharacters through as literal argv, not as shell syntax", async () => {
    // If this went through a shell, the subshell would run and `echo` would
    // print its output instead of the literal text.
    const payload = "$(echo pwned); echo also-pwned && true | false";
    const result = await runner.run({ command: "echo", args: [payload] });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.stdout.trim()).toBe(payload);
    expect(result.stdout).not.toContain("pwned\n");
  });

  it("does not expand globs or tilde", async () => {
    const result = await runner.run({ command: "echo", args: ["*", "~"] });
    expect(result.status === "ok" ? result.stdout.trim() : "").toBe("* ~");
  });
});

describe("NodeProcessRunner: result contract", () => {
  it("reports a non-zero exit as ok-with-exitCode, not as a failure to run", async () => {
    // "The process ran and said no" is an ordinary answer the caller must
    // handle, distinct from "the binary is not there".
    const result = await runner.run({ command: "sh", args: ["-c", "exit 3"] });
    expect(result.status).toBe("ok");
    expect(result.status === "ok" ? result.exitCode : null).toBe(3);
  });

  it("captures stdout and stderr separately", async () => {
    const result = await runner.run({
      command: "sh",
      args: ["-c", "echo out; echo err 1>&2"],
    });
    expect(result.status === "ok" ? result.stdout.trim() : "").toBe("out");
    expect(result.status === "ok" ? result.stderr.trim() : "").toBe("err");
  });

  it("reports a missing binary as spawn-failed rather than throwing", async () => {
    const result = await runner.run({
      command: "definitely-not-a-real-binary-hk",
      args: ["x"],
    });
    expect(result.status).toBe("spawn-failed");
    expect(result.status === "spawn-failed" ? result.reason : "").toContain(
      "definitely-not-a-real-binary-hk",
    );
  });

  it("kills a hanging process and reports timed-out", async () => {
    const result = await runner.run({
      command: "sh",
      args: ["-c", "sleep 30"],
      timeoutMs: 300,
    });
    expect(result.status).toBe("timed-out");
    expect(result.status === "timed-out" ? result.timeoutMs : 0).toBe(300);
  });

  it("runs in the requested working directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hk-proc-"));
    const result = await runner.run({ command: "pwd", args: [], cwd: dir });
    // macOS reports /private/var for /var; compare on the trailing segment.
    expect(result.status === "ok" ? result.stdout.trim() : "").toContain(
      dir.split("/").pop() as string,
    );
  });

  it("defaults NO_COLOR on so captured output has no escape codes", async () => {
    const result = await runner.run({ command: "sh", args: ["-c", "echo $NO_COLOR"] });
    expect(result.status === "ok" ? result.stdout.trim() : "").toBe("1");
  });

  it("lets a caller override an inherited variable", async () => {
    const result = await runner.run({
      command: "sh",
      args: ["-c", "echo $HK_TEST_VAR"],
      env: { HK_TEST_VAR: "set-by-caller" },
    });
    expect(result.status === "ok" ? result.stdout.trim() : "").toBe("set-by-caller");
  });
});

describe("NodeProcessRunner.which", () => {
  it("resolves a real binary on PATH to an absolute path", async () => {
    const resolved = await runner.which("sh");
    expect(resolved).toBeTypeOf("string");
    expect(resolved as string).toMatch(/\/sh$/);
  });

  it("returns null for a binary that is not installed", async () => {
    expect(await runner.which("definitely-not-a-real-binary-hk")).toBeNull();
  });

  it("requires executability when scanning PATH, not mere existence", async () => {
    // Separate branch from the path-shaped case below: a non-executable file
    // sitting in a PATH directory must not be reported as an installed tool,
    // or a capability probe would offer an action that cannot run.
    const dir = await mkdtemp(join(tmpdir(), "hk-path-"));
    const name = "hk-fake-tool";
    await writeFile(join(dir, name), ["#!/bin/sh", "true", ""].join("\n"));
    const scoped = new NodeProcessRunner();
    const previous = process.env.PATH;
    process.env.PATH = `${dir}:${previous ?? ""}`;
    try {
      expect(await scoped.which(name)).toBeNull();
      await chmod(join(dir, name), 0o755);
      expect(await scoped.which(name)).toBe(join(dir, name));
    } finally {
      process.env.PATH = previous;
    }
  });

  it("answers a path-shaped command from the filesystem, and requires executability", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hk-which-"));
    const script = join(dir, "tool");
    await writeFile(script, "#!/bin/sh\necho hi\n");
    expect(await runner.which(script)).toBeNull(); // present but not executable
    await chmod(script, 0o755);
    expect(await runner.which(script)).toBe(script);
  });

  it("does not RUN the binary it is probing", async () => {
    // Probing must not have side effects: a user asking "can I sync to
    // Codex" has not asked to execute anything.
    const dir = await mkdtemp(join(tmpdir(), "hk-which-"));
    const marker = join(dir, "ran");
    const script = join(dir, "tool");
    await writeFile(script, `#!/bin/sh\ntouch ${marker}\n`);
    await chmod(script, 0o755);

    expect(await runner.which(script)).toBe(script);
    await expect(readFile(marker)).rejects.toThrow();
  });
});
