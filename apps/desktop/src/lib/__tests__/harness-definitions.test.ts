import { describe, it, expect } from "vitest";
import {
  shellQuote,
  buildInvokeCommand,
  BUILTIN_HARNESSES,
  type PermissionConfig,
} from "../harness-definitions";

// ── shellQuote ──────────────────────────────────────────────────────────────

describe("shellQuote", () => {
  it("returns empty quotes for empty string", () => {
    expect(shellQuote("")).toBe("''");
  });

  it("passes through simple strings", () => {
    expect(shellQuote("hello")).toBe("hello");
    expect(shellQuote("claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
  });

  it("quotes strings with spaces", () => {
    expect(shellQuote("hello world")).toBe("'hello world'");
  });

  it("escapes embedded single quotes", () => {
    expect(shellQuote("it's a test")).toBe("'it'\\''s a test'");
  });

  it("quotes strings with double quotes", () => {
    expect(shellQuote('say "hello"')).toBe("'say \"hello\"'");
  });

  it("quotes strings with backslashes", () => {
    expect(shellQuote("path\\to\\file")).toBe("'path\\to\\file'");
  });

  it("quotes strings with dollar signs", () => {
    expect(shellQuote("$HOME")).toBe("'$HOME'");
  });

  it("quotes strings with backticks", () => {
    expect(shellQuote("`whoami`")).toBe("'`whoami`'");
  });

  it("quotes strings with semicolons", () => {
    expect(shellQuote("a; rm -rf /")).toBe("'a; rm -rf /'");
  });

  it("quotes strings with pipes", () => {
    expect(shellQuote("a | b")).toBe("'a | b'");
  });

  it("strips null bytes before quoting", () => {
    expect(shellQuote("hello\0world")).toBe("helloworld");
    expect(shellQuote("hello\0 world")).toBe("'hello world'");
    expect(shellQuote("\0")).toBe("");
  });

  it("quotes strings containing newlines", () => {
    expect(shellQuote("line1\nline2")).toBe("'line1\nline2'");
  });

  it("quotes strings containing carriage returns", () => {
    expect(shellQuote("line1\rline2")).toBe("'line1\rline2'");
  });

  it("quotes compound injection attempts", () => {
    const result = shellQuote("'; rm -rf /; echo '");
    expect(result).toBe("''\\''; rm -rf /; echo '\\'''");
  });

  it("quotes strings with $() command substitution", () => {
    expect(shellQuote("$(whoami)")).toBe("'$(whoami)'");
  });
});

// ── buildInvokeCommand — default (skip) mode ────────────────────────────────

describe("buildInvokeCommand — default (no config)", () => {
  it("defaults to --dangerously-skip-permissions when no config given", () => {
    const cmd = buildInvokeCommand("claude", "fix the bug");
    expect(cmd).toBe("claude 'fix the bug' --dangerously-skip-permissions");
  });

  it("includes model when provided", () => {
    const cmd = buildInvokeCommand("claude", "fix it", "claude-sonnet-4-6");
    expect(cmd).toBe("claude 'fix it' --dangerously-skip-permissions --model claude-sonnet-4-6");
  });

  it("quotes prompts with special characters", () => {
    const cmd = buildInvokeCommand("claude", "what's this?", "opus");
    expect(cmd).toBe("claude 'what'\\''s this?' --dangerously-skip-permissions --model opus");
  });
});

// ── buildInvokeCommand — skip mode ──────────────────────────────────────────

describe("buildInvokeCommand — { mode: 'skip' }", () => {
  const cfg: PermissionConfig = { mode: "skip" };

  it("uses --dangerously-skip-permissions", () => {
    expect(buildInvokeCommand("claude", "do something", undefined, cfg))
      .toBe("claude 'do something' --dangerously-skip-permissions");
  });

  it("includes model", () => {
    expect(buildInvokeCommand("claude", "do it", "claude-opus-4-6", cfg))
      .toBe("claude 'do it' --dangerously-skip-permissions --model claude-opus-4-6");
  });
});

// ── buildInvokeCommand — auto mode ──────────────────────────────────────────

describe("buildInvokeCommand — { mode: 'auto' }", () => {
  const cfg: PermissionConfig = { mode: "auto" };

  it("uses --permission-mode auto", () => {
    expect(buildInvokeCommand("claude", "do something", undefined, cfg))
      .toBe("claude 'do something' --permission-mode auto");
  });

  it("includes model", () => {
    expect(buildInvokeCommand("claude", "task", "claude-sonnet-4-6", cfg))
      .toBe("claude task --permission-mode auto --model claude-sonnet-4-6");
  });

  it("never contains --dangerously-skip-permissions", () => {
    expect(buildInvokeCommand("claude", "task", undefined, cfg))
      .not.toContain("--dangerously-skip-permissions");
  });
});

// ── buildInvokeCommand — allowed-tools mode ─────────────────────────────────

describe("buildInvokeCommand — { mode: 'allowed-tools' }", () => {
  it("uses --allowedTools with the provided list", () => {
    const cfg: PermissionConfig = { mode: "allowed-tools", tools: ["Read", "Grep", "Glob"] };
    expect(buildInvokeCommand("claude", "fix bug", undefined, cfg))
      .toBe("claude 'fix bug' --allowedTools Read,Grep,Glob");
  });

  it("uses no permission flags when tools list is empty (Claude prompts for all)", () => {
    const cfg: PermissionConfig = { mode: "allowed-tools", tools: [] };
    expect(buildInvokeCommand("claude", "task", undefined, cfg))
      .toBe("claude task");
  });

  it("includes model after the tools flag", () => {
    const cfg: PermissionConfig = { mode: "allowed-tools", tools: ["Read", "Write"] };
    expect(buildInvokeCommand("claude", "task", "claude-opus-4-6", cfg))
      .toBe("claude task --allowedTools Read,Write --model claude-opus-4-6");
  });

  it("never contains --dangerously-skip-permissions when tools are specified", () => {
    const cfg: PermissionConfig = { mode: "allowed-tools", tools: ["Read"] };
    expect(buildInvokeCommand("claude", "task", undefined, cfg))
      .not.toContain("--dangerously-skip-permissions");
  });
});

// ── Non-Claude harnesses ignore permission config ────────────────────────────

describe("buildInvokeCommand — non-Claude harnesses ignore permission config", () => {
  const skipCfg: PermissionConfig = { mode: "skip" };
  const autoCfg: PermissionConfig = { mode: "auto" };

  it("cursor-agent is unaffected by config", () => {
    expect(buildInvokeCommand("cursor-agent", "refactor auth", undefined, skipCfg))
      .toBe("agent 'refactor auth'");
    expect(buildInvokeCommand("cursor-agent", "refactor auth", undefined, autoCfg))
      .toBe("agent 'refactor auth'");
  });

  it("copilot is unaffected by config", () => {
    expect(buildInvokeCommand("copilot", "explain this repo", undefined, skipCfg))
      .toBe("copilot -i 'explain this repo'");
  });

  it("codex is unaffected by config", () => {
    expect(buildInvokeCommand("codex", "add tests", undefined, skipCfg))
      .toBe("codex 'add tests'");
  });

  it("opencode is unaffected by config", () => {
    expect(buildInvokeCommand("opencode", "add auth", undefined, skipCfg))
      .toBe("opencode 'add auth'");
  });
});

// ── Other harnesses (no config) ──────────────────────────────────────────────

describe("buildInvokeCommand — other harnesses", () => {
  it("builds cursor-agent command with model", () => {
    expect(buildInvokeCommand("cursor-agent", "test", "gpt-5.2")).toBe("agent test --model gpt-5.2");
  });

  it("builds copilot command with -i flag", () => {
    expect(buildInvokeCommand("copilot", "explain this repo")).toBe("copilot -i 'explain this repo'");
  });

  it("builds copilot command with model", () => {
    expect(buildInvokeCommand("copilot", "explain", "claude-sonnet-4"))
      .toBe("copilot -i explain --model claude-sonnet-4");
  });

  it("builds codex command with positional prompt", () => {
    expect(buildInvokeCommand("codex", "add tests")).toBe("codex 'add tests'");
  });

  it("builds codex command with model", () => {
    expect(buildInvokeCommand("codex", "refactor", "o4-mini")).toBe("codex refactor --model o4-mini");
  });

  it("builds opencode command with positional prompt", () => {
    expect(buildInvokeCommand("opencode", "add auth")).toBe("opencode 'add auth'");
  });

  it("builds opencode command with model", () => {
    expect(buildInvokeCommand("opencode", "refactor", "gpt-4o")).toBe("opencode refactor --model gpt-4o");
  });

  it("returns null for unknown harness", () => {
    expect(buildInvokeCommand("unknown-harness", "hi")).toBeNull();
  });
});

// ── Registry ─────────────────────────────────────────────────────────────────

describe("BUILTIN_HARNESSES registry", () => {
  it("has 5 built-in harnesses", () => {
    expect(BUILTIN_HARNESSES).toHaveLength(5);
  });

  it("all harnesses have unique ids", () => {
    const ids = BUILTIN_HARNESSES.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── Model injection prevention ────────────────────────────────────────────────

describe("model injection prevention", () => {
  it("model with embedded flags is shell-quoted, not treated as real flags", () => {
    const cmd = buildInvokeCommand("claude", "task", "sonnet --dangerously-skip-permissions");
    expect(cmd).toContain("'sonnet --dangerously-skip-permissions'");
  });

  it("model with spaces is shell-quoted", () => {
    const cmd = buildInvokeCommand("claude", "task", "claude sonnet");
    expect(cmd).toContain("'claude sonnet'");
  });

  it("model with dollar sign prevents variable expansion", () => {
    const cmd = buildInvokeCommand("claude", "task", "$MODEL");
    expect(cmd).toContain("'$MODEL'");
  });
});
