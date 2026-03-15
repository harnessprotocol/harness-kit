import { describe, it, expect } from "vitest";
import {
  buildMarkerBlock,
  findMarkerBlock,
  replaceMarkerBlock,
  appendMarkerBlock,
  findOrphanedMarkerBlocks,
  removeOrphanedBlocks,
} from "../src/compile/markers.js";

describe("buildMarkerBlock", () => {
  it("wraps content in markers", () => {
    const result = buildMarkerBlock("my-harness", "operational", "## Commands\n- Build: `npm run build`");
    expect(result).toBe(
      "<!-- BEGIN harness:my-harness:operational -->\n## Commands\n- Build: `npm run build`\n<!-- END harness:my-harness:operational -->",
    );
  });
});

describe("findMarkerBlock", () => {
  it("finds an existing marker block", () => {
    const content = [
      "# My CLAUDE.md",
      "",
      "<!-- BEGIN harness:my-harness:operational -->",
      "## Commands",
      "- Build: `npm run build`",
      "<!-- END harness:my-harness:operational -->",
      "",
      "# Manual section",
    ].join("\n");

    const result = findMarkerBlock(content, "my-harness", "operational");
    expect(result).not.toBeNull();
    expect(result!.startLine).toBe(2);
    expect(result!.endLine).toBe(5);
    expect(result!.content).toBe("## Commands\n- Build: `npm run build`");
  });

  it("returns null when no block exists", () => {
    const result = findMarkerBlock("# Just a file", "my-harness", "operational");
    expect(result).toBeNull();
  });

  it("does not match different names", () => {
    const content =
      "<!-- BEGIN harness:other:operational -->\ncontent\n<!-- END harness:other:operational -->";
    const result = findMarkerBlock(content, "my-harness", "operational");
    expect(result).toBeNull();
  });
});

describe("replaceMarkerBlock", () => {
  it("replaces content between markers", () => {
    const original = [
      "# Header",
      "<!-- BEGIN harness:test:operational -->",
      "old content",
      "<!-- END harness:test:operational -->",
      "# Footer",
    ].join("\n");

    const result = replaceMarkerBlock(original, "test", "operational", "new content");
    expect(result).toContain("new content");
    expect(result).not.toContain("old content");
    expect(result).toContain("# Header");
    expect(result).toContain("# Footer");
  });

  it("returns original content if block not found", () => {
    const original = "# No markers here";
    const result = replaceMarkerBlock(original, "test", "operational", "new");
    expect(result).toBe(original);
  });
});

describe("appendMarkerBlock", () => {
  it("appends to existing content", () => {
    const result = appendMarkerBlock("# Existing\n\nSome content", "test", "operational", "new stuff");
    expect(result).toContain("# Existing");
    expect(result).toContain("<!-- BEGIN harness:test:operational -->");
    expect(result).toContain("new stuff");
    expect(result).toContain("<!-- END harness:test:operational -->");
  });

  it("handles empty content", () => {
    const result = appendMarkerBlock("", "test", "operational", "new stuff");
    expect(result).toContain("<!-- BEGIN harness:test:operational -->");
  });
});

describe("findOrphanedMarkerBlocks", () => {
  it("finds blocks with a different name", () => {
    const content = [
      "<!-- BEGIN harness:old-name:operational -->",
      "old content",
      "<!-- END harness:old-name:operational -->",
      "",
      "<!-- BEGIN harness:current:operational -->",
      "current content",
      "<!-- END harness:current:operational -->",
    ].join("\n");

    const orphans = findOrphanedMarkerBlocks(content, "current", "CLAUDE.md");
    expect(orphans).toHaveLength(1);
    expect(orphans[0].name).toBe("old-name");
    expect(orphans[0].slot).toBe("operational");
    expect(orphans[0].file).toBe("CLAUDE.md");
  });

  it("returns empty array when no orphans", () => {
    const content =
      "<!-- BEGIN harness:current:operational -->\ncontent\n<!-- END harness:current:operational -->";
    const orphans = findOrphanedMarkerBlocks(content, "current", "test.md");
    expect(orphans).toHaveLength(0);
  });
});

describe("removeOrphanedBlocks", () => {
  it("removes orphaned blocks", () => {
    const content = [
      "# Header",
      "<!-- BEGIN harness:old:operational -->",
      "old content",
      "<!-- END harness:old:operational -->",
      "",
      "# Footer",
    ].join("\n");

    const orphans = findOrphanedMarkerBlocks(content, "current", "test.md");
    const result = removeOrphanedBlocks(content, orphans);
    expect(result).toContain("# Header");
    expect(result).toContain("# Footer");
    expect(result).not.toContain("old content");
    expect(result).not.toContain("<!-- BEGIN harness:old:operational -->");
  });
});
