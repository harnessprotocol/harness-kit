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
});

// ── buildInvokeCommand ──────────────────────────────────────

describe("buildInvokeCommand", () => {
  // ── Claude Code ─────────────────────────────────────────

  // All harnesses use interactive mode (no -p) for full TUI with live streaming.

  it("builds claude command with prompt only", () => {
    expect(buildInvokeCommand("claude", "fix the bug")).toBe(
      "claude 'fix the bug'",
    );
  });

  it("builds claude command with prompt and model", () => {
    expect(buildInvokeCommand("claude", "fix it", "claude-sonnet-4-6")).toBe(
      "claude 'fix it' --model claude-sonnet-4-6",
    );
  });

  it("quotes claude prompt with special characters", () => {
    expect(buildInvokeCommand("claude", "what's this?", "opus")).toBe(
      "claude 'what'\\''s this?' --model opus",
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

  // ── Unknown harness ─────────────────────────────────────

  it("returns null for unknown harness", () => {
    expect(buildInvokeCommand("unknown-harness", "hi")).toBeNull();
  });

  // ── Registry ────────────────────────────────────────────

  it("has 4 built-in harnesses", () => {
    expect(BUILTIN_HARNESSES).toHaveLength(4);
  });

  it("all harnesses have unique ids", () => {
    const ids = BUILTIN_HARNESSES.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
