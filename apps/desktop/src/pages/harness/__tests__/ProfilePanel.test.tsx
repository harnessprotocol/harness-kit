import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { parse } from "yaml";
import { parseHarness } from "@harness-kit/core";
import ProfilePanel from "../harness-file/ProfilePanel";
import { applyYamlPatch } from "../../../lib/harness-yaml-patch";

const SOURCE = `# profile
version: "2"
metadata:
  name: demo
  description: A demo
plugins:
  - name: alpha # keep me
    source: github:org/alpha
mcp-servers:
  git:
    transport: stdio
    command: git-mcp
  web:
    transport: http
    url: https://example.com/mcp
env:
  - name: TOKEN
    description: A token
instructions:
  operational: Be brief.
permissions:
  tools:
    allow:
      - Read
extends:
  - source: base-profile
`;

function Harness({ initial = SOURCE, editable = true }: { initial?: string; editable?: boolean }) {
  const [text, setText] = useState(initial);
  const { config } = parseHarness(text);
  return (
    <>
      <ProfilePanel config={config} onPatch={editable ? (p) => setText((t) => applyYamlPatch(t, p)) : undefined} />
      <pre data-testid="yaml">{text}</pre>
    </>
  );
}

const current = () => parse(screen.getByTestId("yaml").textContent ?? "");
const edit = (name: string, value: string) => {
  const field = screen.getByRole("textbox", { name });
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
};

describe("ProfilePanel round trips into the YAML text", () => {
  it("metadata: edits scalar fields, tags and author", () => {
    render(<Harness />);
    edit("Name", "renamed");
    edit("Version", "1.2.0");
    edit("Author", "Ada");
    edit("Tags (comma separated)", "a, b");
    expect(current().metadata).toMatchObject({ name: "renamed", version: "1.2.0", author: { name: "Ada" }, tags: ["a", "b"] });
    edit("Version", "");
    expect(current().metadata).not.toHaveProperty("version");
    expect(screen.getByTestId("yaml").textContent).toContain("# profile");
  });

  it("plugins: edits, removes, and adds an entry, keeping comments", () => {
    render(<Harness />);
    edit("Plugin 1 source", "github:org/alpha2");
    expect(current().plugins[0].source).toBe("github:org/alpha2");
    expect(screen.getByTestId("yaml").textContent).toContain("# keep me");

    const add = screen.getByRole("group", { name: "Add plugin" });
    expect(within(add).getByRole("button", { name: "Add plugin" })).toBeDisabled();
    fireEvent.change(within(add).getByLabelText("New plugin name"), { target: { value: "beta" } });
    fireEvent.change(within(add).getByLabelText("New plugin source"), { target: { value: "github:org/beta" } });
    fireEvent.click(within(add).getByRole("button", { name: "Add plugin" }));
    expect(current().plugins.map((p: { name: string }) => p.name)).toEqual(["alpha", "beta"]);

    fireEvent.click(screen.getByRole("button", { name: "Remove plugin alpha" }));
    expect(current().plugins).toEqual([{ name: "beta", source: "github:org/beta" }]);
  });

  it("mcp servers: edits the command or url and removes a server", () => {
    render(<Harness />);
    edit("git command", "git-mcp --safe");
    edit("web URL", "https://example.com/v2");
    expect(current()["mcp-servers"].git.command).toBe("git-mcp --safe");
    expect(current()["mcp-servers"].web.url).toBe("https://example.com/v2");
    fireEvent.click(screen.getByRole("button", { name: "Remove MCP server web" }));
    expect(Object.keys(current()["mcp-servers"])).toEqual(["git"]);
  });

  it("env: edits, toggles required and sensitive, adds and removes", () => {
    render(<Harness />);
    edit("Variable 1 description", "A secret token");
    fireEvent.click(screen.getByRole("switch", { name: "Required: TOKEN" }));
    expect(current().env[0]).toEqual({ name: "TOKEN", description: "A secret token", required: true });
    fireEvent.click(screen.getByRole("switch", { name: "Required: TOKEN" }));
    expect(current().env[0]).not.toHaveProperty("required");

    const add = screen.getByRole("group", { name: "Add variable" });
    fireEvent.change(within(add).getByLabelText("New variable name"), { target: { value: "REGION" } });
    fireEvent.change(within(add).getByLabelText("New variable description"), { target: { value: "Region" } });
    fireEvent.click(within(add).getByRole("button", { name: "Add variable" }));
    expect(current().env.map((e: { name: string }) => e.name)).toEqual(["TOKEN", "REGION"]);

    fireEvent.click(screen.getByRole("button", { name: "Remove variable TOKEN" }));
    expect(current().env.map((e: { name: string }) => e.name)).toEqual(["REGION"]);
  });

  it("env: sensitive defaults to on; Default is offered only after turning it off, and turning it on drops the default", () => {
    render(<Harness />);
    // The file says nothing about `sensitive`, and the schema's default is true.
    expect(screen.getByRole("switch", { name: "Sensitive: TOKEN" })).toBeChecked();
    expect(screen.queryByRole("textbox", { name: "Variable 1 default" })).toBeNull();

    fireEvent.click(screen.getByRole("switch", { name: "Sensitive: TOKEN" }));
    expect(current().env[0].sensitive).toBe(false);
    expect(screen.getByRole("switch", { name: "Sensitive: TOKEN" })).not.toBeChecked();
    edit("Variable 1 default", "abc");
    expect(current().env[0]).toMatchObject({ sensitive: false, default: "abc" });

    fireEvent.click(screen.getByRole("switch", { name: "Sensitive: TOKEN" }));
    expect(current().env[0]).not.toHaveProperty("sensitive");
    expect(current().env[0]).not.toHaveProperty("default");
    expect(screen.queryByRole("textbox", { name: "Variable 1 default" })).toBeNull();
  });

  it("plugins: the source placeholder is an owner/repo example", () => {
    render(<Harness />);
    expect(screen.getByLabelText("New plugin source")).toHaveAttribute("placeholder", "owner/repo");
  });

  it("instructions: edits a slot, adds another, sets and clears import mode", () => {
    render(<Harness />);
    edit("Operational", "Be very brief.");
    edit("Identity", "A careful assistant.");
    fireEvent.change(screen.getByRole("combobox", { name: "Import mode" }), { target: { value: "replace" } });
    expect(current().instructions).toEqual({ operational: "Be very brief.", identity: "A careful assistant.", "import-mode": "replace" });
    edit("Identity", "");
    fireEvent.change(screen.getByRole("combobox", { name: "Import mode" }), { target: { value: "" } });
    expect(current().instructions).toEqual({ operational: "Be very brief." });
  });

  it("permissions: adds, edits and removes entries, creating lists that are missing", () => {
    render(<Harness />);
    const addTool = screen.getByRole("group", { name: "Add tool to denied tools" });
    fireEvent.change(within(addTool).getByLabelText("New tool"), { target: { value: "Bash" } });
    fireEvent.click(within(addTool).getByRole("button", { name: "Add tool to denied tools" }));
    expect(current().permissions.tools).toEqual({ allow: ["Read"], deny: ["Bash"] });

    edit("Allowed tools: tool 1", "Grep");
    expect(current().permissions.tools.allow).toEqual(["Grep"]);

    fireEvent.click(screen.getByRole("button", { name: "Remove tool Bash" }));
    expect(current().permissions.tools).toEqual({ allow: ["Grep"] });

    const addHost = screen.getByRole("group", { name: "Add host to allowed hosts" });
    fireEvent.change(within(addHost).getByLabelText("New host"), { target: { value: "example.com" } });
    fireEvent.click(within(addHost).getByRole("button", { name: "Add host to allowed hosts" }));
    expect(current().permissions.network).toEqual({ "allowed-hosts": ["example.com"] });
  });

  it("extends: edits a source and version, and removes the entry", () => {
    render(<Harness />);
    edit("Extends 1 source", "other-profile");
    edit("Extends 1 version", "^1");
    expect(current().extends).toEqual([{ source: "other-profile", version: "^1" }]);
    fireEvent.click(screen.getByRole("button", { name: "Remove extends other-profile" }));
    expect(current()).not.toHaveProperty("extends");
  });

  describe("a section in a shape the types do not promise", () => {
    const WRONG_SHAPES: Array<[string, string, string]> = [
      ["plugins as a string", "plugins: abc\n", "Plugins"],
      ["env as a map", "env:\n  NAME: x\n", "Environment"],
      ["extends as a string", "extends: owner/repo\n", "Extends"],
      ["permissions.tools.allow as a string", "permissions:\n  tools:\n    allow: Bash\n", "Permissions"],
      ["metadata.name as a map", "metadata:\n  name:\n    a: 1\n", "Metadata"],
      ["mcp-servers as a list", "mcp-servers:\n  - x\n", "MCP Servers"],
      ["plugin entry as a string", "plugins:\n  - abc\n", "Plugins"],
    ];

    for (const [title, yaml, label] of WRONG_SHAPES) {
      for (const editable of [true, false]) {
        it(`${title}: renders a note instead of throwing (${editable ? "editable" : "read-only"})`, () => {
          const errors = vi.spyOn(console, "error").mockImplementation(() => {});
          render(<Harness initial={`version: "2"\n${yaml}`} editable={editable} />);
          expect(screen.queryByTestId("profile-panel-failed")).toBeNull();
          const notes = screen.getAllByTestId("section-shape-note").map((n) => n.textContent);
          expect(notes.some((n) => n?.startsWith(`${label}:`) && n.includes("Edit it in the YAML"))).toBe(true);
          errors.mockRestore();
        });
      }
    }

    it("still shows the well-shaped sections beside the malformed one", () => {
      render(<Harness initial={`version: "2"\nplugins: abc\nmetadata:\n  name: demo\n`} />);
      expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("demo");
    });

    it("an error that slips past the shape checks is caught by the panel's own boundary", () => {
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const config = {} as Record<string, unknown>;
      Object.defineProperty(config, "plugins", {
        enumerable: true,
        get() {
          throw new Error("unforeseen");
        },
      });
      render(
        <>
          <textarea data-testid="editor" defaultValue="unsaved" />
          <ProfilePanel config={config as never} onPatch={() => {}} />
        </>,
      );
      expect(screen.getByTestId("profile-panel-failed")).toBeInTheDocument();
      expect(screen.getByTestId("editor")).toHaveValue("unsaved");
      errors.mockRestore();
    });
  });

  it("is read-only without onPatch: no fields, no buttons", () => {
    render(<Harness editable={false} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("alpha")).toBeInTheDocument();
  });
});
