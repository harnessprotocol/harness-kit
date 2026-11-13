import { describe, it, expect } from "vitest";
import { parse } from "yaml";
import { applyYamlPatch, YamlPatchError } from "../harness-yaml-patch";

const SOURCE = `# my profile
version: "2"
metadata:
  name: demo # the name
  description: A demo
plugins:
  # first
  - name: alpha
    source: github:org/alpha
  - name: beta
    source: github:org/beta
env:
  - name: TOKEN
    description: A token
`;

describe("applyYamlPatch", () => {
  it("sets a scalar and keeps comments and key order", () => {
    const out = applyYamlPatch(SOURCE, { op: "set", path: ["metadata", "name"], value: "renamed" });
    expect(out).toContain("# my profile");
    expect(out).toContain("name: renamed # the name");
    expect(out).toContain("# first");
    expect(out.indexOf("metadata")).toBeLessThan(out.indexOf("plugins"));
    expect(parse(out).metadata.name).toBe("renamed");
  });

  it("sets a value under a map that does not exist yet", () => {
    const out = applyYamlPatch(SOURCE, { op: "set", path: ["metadata", "author", "name"], value: "Ada" });
    expect(parse(out).metadata.author).toEqual({ name: "Ada" });
  });

  it("removes the key when the value is empty, and prunes the map it leaves empty", () => {
    const out = applyYamlPatch(
      applyYamlPatch(SOURCE, { op: "set", path: ["metadata", "author", "name"], value: "Ada" }),
      { op: "set", path: ["metadata", "author", "name"], value: "" },
    );
    expect(parse(out).metadata).toEqual({ name: "demo", description: "A demo" });
  });

  it("removes a list entry and keeps the comment on its sibling", () => {
    const out = applyYamlPatch(SOURCE, { op: "remove", path: ["plugins", 1] });
    expect(parse(out).plugins).toEqual([{ name: "alpha", source: "github:org/alpha" }]);
    expect(out).toContain("# first");
  });

  it("drops the list when its last entry is removed", () => {
    const out = applyYamlPatch(SOURCE, { op: "remove", path: ["env", 0] });
    expect(parse(out)).not.toHaveProperty("env");
  });

  it("appends to an existing list", () => {
    const out = applyYamlPatch(SOURCE, {
      op: "append",
      path: ["plugins"],
      value: { name: "gamma", source: "github:org/gamma" },
    });
    expect(parse(out).plugins.map((p: { name: string }) => p.name)).toEqual(["alpha", "beta", "gamma"]);
    expect(out).toContain("# first");
  });

  it("appends to a list that is missing", () => {
    const out = applyYamlPatch('version: "2"\n', { op: "append", path: ["env"], value: { name: "A", description: "a" } });
    expect(parse(out).env).toEqual([{ name: "A", description: "a" }]);
  });

  it("puts a key into a map, creating the map when missing", () => {
    const out = applyYamlPatch(SOURCE, {
      op: "put",
      path: ["mcp-servers"],
      key: "git",
      value: { transport: "stdio", command: "git-mcp" },
    });
    expect(parse(out)["mcp-servers"].git.command).toBe("git-mcp");
  });

  it("keeps a block scalar's style when its text changes", () => {
    const text = 'version: "2"\ninstructions:\n  operational: |\n    one\n    two\n';
    const out = applyYamlPatch(text, { op: "set", path: ["instructions", "operational"], value: "one\nthree\n" });
    expect(out).toContain("operational: |");
    expect(parse(out).instructions.operational).toBe("one\nthree\n");
  });

  it("does not re-fold long strings", () => {
    const long = "word ".repeat(60).trim();
    const text = `version: "2"\nmetadata:\n  name: x\n  description: ${long}\n`;
    const out = applyYamlPatch(text, { op: "set", path: ["metadata", "name"], value: "y" });
    expect(out).toContain(`description: ${long}`);
  });

  it("refuses text that does not parse", () => {
    expect(() => applyYamlPatch("a: [unclosed", { op: "set", path: ["a"], value: 1 })).toThrow(YamlPatchError);
  });

  it("starts a root map from an empty document", () => {
    const out = applyYamlPatch("", { op: "set", path: ["version"], value: "2" });
    expect(parse(out)).toEqual({ version: "2" });
  });

  it("keeps a comment-only file's comment when the first key is added", () => {
    const out = applyYamlPatch("# my notes\n", { op: "set", path: ["version"], value: "2" });
    expect(out).toContain("# my notes");
    expect(parse(out)).toEqual({ version: "2" });
  });

  describe("keeps the file's own style", () => {
    it("a 4-space indent stays 4 spaces", () => {
      const text = 'version: "2"\nmetadata:\n    name: a\n    description: b\n';
      const out = applyYamlPatch(text, { op: "set", path: ["metadata", "name"], value: "c" });
      expect(out).toBe('version: "2"\nmetadata:\n    name: c\n    description: b\n');
    });

    it("a compact list stays compact", () => {
      const text = "plugins:\n- name: a\n  source: o/a\n- name: b\n  source: o/b\n";
      const out = applyYamlPatch(text, { op: "set", path: ["plugins", 0, "name"], value: "z" });
      expect(out).toBe("plugins:\n- name: z\n  source: o/a\n- name: b\n  source: o/b\n");
    });

    it("an indented list stays indented", () => {
      const text = "plugins:\n  - name: a\n    source: o/a\n";
      const out = applyYamlPatch(text, { op: "set", path: ["plugins", 0, "name"], value: "z" });
      expect(out).toBe("plugins:\n  - name: z\n    source: o/a\n");
    });
  });
});

describe("applyYamlPatch adversarial-review regressions", () => {
  it("keeps CRLF line endings", () => {
    const crlf = 'version: "2"\r\nmetadata:\r\n  name: demo\r\n';
    const out = applyYamlPatch(crlf, { op: "set", path: ["metadata", "name"], value: "x" });
    expect(out).toBe('version: "2"\r\nmetadata:\r\n  name: x\r\n');
  });

  it("does not read block-scalar content when inferring list style", () => {
    const text = "operational: |\n  Steps:\n  - one\n  - two\nplugins:\n  - name: a\n    source: s\n";
    const out = applyYamlPatch(text, { op: "append", path: ["plugins"], value: { name: "b", source: "t" } });
    expect(out).toContain("plugins:\n  - name: a");
    expect(out).toContain("\n  - name: b");
  });

  it("refuses a root scalar document", () => {
    expect(() => applyYamlPatch("hello world\n", { op: "set", path: ["a"], value: 1 })).toThrow(YamlPatchError);
  });

  it("keeps the header comment when a removal empties the root", () => {
    const out = applyYamlPatch("# header\nname: x\n", { op: "remove", path: ["name"] });
    expect(out).toContain("# header");
  });
});
