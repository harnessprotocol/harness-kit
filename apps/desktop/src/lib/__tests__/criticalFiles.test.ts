import { describe, expect, it } from "vitest";
import { isCriticalFile } from "../criticalFiles";

describe("isCriticalFile", () => {
  it("detects plugin.json", () => {
    expect(isCriticalFile("/path/to/plugin.json")).toBe(true);
  });

  it("detects CLAUDE.md", () => {
    expect(isCriticalFile("/some/dir/CLAUDE.md")).toBe(true);
  });

  it("detects settings.json", () => {
    expect(isCriticalFile("/foo/settings.json")).toBe(true);
  });

  it("detects hooks.json", () => {
    expect(isCriticalFile("/bar/hooks.json")).toBe(true);
  });

  it("detects .yaml files", () => {
    expect(isCriticalFile("/path/config.yaml")).toBe(true);
  });

  it("detects .yml files", () => {
    expect(isCriticalFile("/path/config.yml")).toBe(true);
  });

  it("returns false for regular files", () => {
    expect(isCriticalFile("/path/to/README.md")).toBe(false);
    expect(isCriticalFile("/path/to/index.ts")).toBe(false);
    expect(isCriticalFile("/path/data.json")).toBe(false);
  });

  it("handles paths with no extension", () => {
    expect(isCriticalFile("/path/to/Makefile")).toBe(false);
  });
});
