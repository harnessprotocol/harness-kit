import { describe, it, expect } from "vitest";
import { errorDetails } from "../error-details";

describe("errorDetails", () => {
  it("gives an Error's message without the 'Error:' prefix or stack", () => {
    expect(errorDetails(new Error("EACCES: permission denied"))).toBe("EACCES: permission denied");
  });

  it("falls back to the name for an Error with no message", () => {
    expect(errorDetails(new TypeError(""))).toBe("TypeError");
  });

  it("passes a Tauri string rejection through", () => {
    expect(errorDetails("Failed to read ~/.claude/settings.json")).toBe("Failed to read ~/.claude/settings.json");
  });

  it("uses a plain object's message, else its JSON, never [object Object]", () => {
    expect(errorDetails({ message: "boom", code: 2 })).toBe("boom");
    expect(errorDetails({ code: 2 })).toBe('{\n  "code": 2\n}');
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(errorDetails(circular)).not.toContain("[object Object]");
    expect(errorDetails({})).not.toContain("[object Object]");
  });

  it("says so when nothing was given", () => {
    expect(errorDetails(undefined)).toMatch(/no error details/i);
    expect(errorDetails(null)).toMatch(/no error details/i);
  });
});
