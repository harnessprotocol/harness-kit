import { describe, it, expect } from "vitest";
import {
  shellQuote,
  buildInvokeCommand,
  BUILTIN_HARNESSES,
} from "../harness-definitions";

// ── shellQuote ──────────────────────────────────────────────

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
    // Null bytes can truncate shell arguments and enable injection
    expect(shellQuote("hello\0world")).toBe("helloworld");
    expect(shellQuote("hello\0 world")).toBe("'hello world'");
    // A lone null byte strips to an empty string (empty-check runs before strip)
    expect(shellQuote("\0")).toBe("");
  });

  it("quotes strings containing newlines", () => {
    // Newlines are safe inside single quotes (valid POSIX multi-line strings)
    expect(shellQuote("line1\nline2")).toBe("'line1\nline2'");
  });

  it("quotes strings containing carriage returns", () => {
    expect(shellQuote("line1\rline2")).toBe("'line1\rline2'");
  });

  it("quotes compound injection attempts — semicolons are enclosed in single quotes", () => {
    // The result must wrap everything in single quotes so `;` is not a shell
    // command separator. POSIX: content inside '...' is always literal.
    // Input: '; rm -rf /; echo '
    // Output: ''\''; rm -rf /; echo '\''' — the semicolons are inside '...' sections
    const result = shellQuote("'; rm -rf /; echo '");
    expect(result).toBe("''\\''; rm -rf /; echo '\\'''");
  });

  it("quotes strings with $() command substitution", () => {
    expect(shellQuote("$(whoami)")).toBe("'$(whoami)'");
  });
});

// ── buildInvokeCommand ──────────────────────────────────────

describe("buildInvokeCommand", () => {
  // ── Claude Code ─────────────────────────────────────────

  // All harnesses use interactive mode (no -p) for full TUI with live streaming.

  it("builds claude command with prompt and auto permission mode", () => {
    expect(buildInvokeCommand("claude", "fix the bug")).toBe(
      "claude 'fix the bug' --permission-mode auto",
    );
  });

  it("builds claude command with prompt, auto permission mode, and model", () => {
    expect(buildInvokeCommand("claude", "fix it", "claude-sonnet-4-6")).toBe(
      "claude 'fix it' --permission-mode auto --model claude-sonnet-4-6",
    );
  });

  it("quotes claude prompt with special characters", () => {
    expect(buildInvokeCommand("claude", "what's this?", "opus")).toBe(
      "claude 'what'\\''s this?' --permission-mode auto --model opus",
    );
  });

  // ── Cursor Agent ────────────────────────────────────────

  it("builds cursor-agent command with prompt only", () => {
    expect(buildInvokeCommand("cursor-agent", "refactor auth")).toBe(
      "agent 'refactor auth'",
    );
  });

  it("builds cursor-agent command with model", () => {
    expect(buildInvokeCommand("cursor-agent", "test", "gpt-5.2")).toBe(
      "agent test --model gpt-5.2",
    );
  });

  // ── GitHub Copilot ──────────────────────────────────────

  it("builds copilot command with -i flag for interactive mode", () => {
    expect(buildInvokeCommand("copilot", "explain this repo")).toBe(
      "copilot -i 'explain this repo'",
    );
  });

  it("builds copilot command with model", () => {
    expect(buildInvokeCommand("copilot", "explain", "claude-sonnet-4")).toBe(
      "copilot -i explain --model claude-sonnet-4",
    );
  });

  // ── Codex CLI ───────────────────────────────────────────

  it("builds codex command with positional prompt", () => {
    expect(buildInvokeCommand("codex", "add tests")).toBe(
      "codex 'add tests'",
    );
  });

  it("builds codex command with model", () => {
    expect(buildInvokeCommand("codex", "refactor", "o4-mini")).toBe(
      "codex refactor --model o4-mini",
    );
  });

  // ── OpenCode ─────────────────────────────────────────────

  it("builds opencode command with positional prompt", () => {
    expect(buildInvokeCommand("opencode", "add auth")).toBe(
      "opencode 'add auth'",
    );
  });

  it("builds opencode command with model", () => {
    expect(buildInvokeCommand("opencode", "refactor", "gpt-4o")).toBe(
      "opencode refactor --model gpt-4o",
    );
  });

  // ── Unknown harness ─────────────────────────────────────

  it("returns null for unknown harness", () => {
    expect(buildInvokeCommand("unknown-harness", "hi")).toBeNull();
  });

  // ── Registry ────────────────────────────────────────────

  it("has 5 built-in harnesses", () => {
    expect(BUILTIN_HARNESSES).toHaveLength(5);
  });

  it("all harnesses have unique ids", () => {
    const ids = BUILTIN_HARNESSES.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // ── Claude permission-mode invariants ────────────────────────
  // Regression tests: these fail if --permission-mode auto is ever
  // swapped back for --dangerously-skip-permissions.

  it("claude command always contains --permission-mode auto", () => {
    const cmd = buildInvokeCommand("claude", "do something");
    expect(cmd).toContain("--permission-mode auto");
  });

  it("claude command never contains --dangerously-skip-permissions", () => {
    const cmd = buildInvokeCommand("claude", "do something");
    expect(cmd).not.toContain("--dangerously-skip-permissions");
  });

  it("claude command with model still enforces --permission-mode auto", () => {
    const cmd = buildInvokeCommand("claude", "task", "claude-opus-4-6");
    expect(cmd).toContain("--permission-mode auto");
    expect(cmd).not.toContain("--dangerously-skip-permissions");
  });

  // ── Model injection prevention ───────────────────────────────
  // A model value that looks like a shell flag must be quoted so the
  // shell receives it as a single argument, not separate tokens.

  it("model with embedded flags is shell-quoted, not treated as real flags", () => {
    const cmd = buildInvokeCommand("claude", "task", "sonnet --dangerously-skip-permissions");
    expect(cmd).toContain("'sonnet --dangerously-skip-permissions'");
    expect(cmd).toContain("--permission-mode auto");
  });

  it("model with spaces is shell-quoted", () => {
    const cmd = buildInvokeCommand("claude", "task", "claude sonnet");
    expect(cmd).toContain("'claude sonnet'");
  });

  it("model with dollar sign is shell-quoted to prevent variable expansion", () => {
    const cmd = buildInvokeCommand("claude", "task", "$MODEL");
    expect(cmd).toContain("'$MODEL'");
  });
});
