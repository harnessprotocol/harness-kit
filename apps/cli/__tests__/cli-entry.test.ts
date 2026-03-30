import { describe, it, expect } from "vitest";
import { validateCommand } from "../src/commands/validate.js";
import { compileCommand } from "../src/commands/compile.js";

describe("CLI entry point", () => {
  it("validates the CLI commands are properly exported", () => {
    // This test verifies that the main CLI commands are exported and callable
    expect(validateCommand).toBeDefined();
    expect(typeof validateCommand).toBe("function");
    expect(compileCommand).toBeDefined();
    expect(typeof compileCommand).toBe("function");
  });
});
