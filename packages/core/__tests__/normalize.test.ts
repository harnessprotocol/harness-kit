import { describe, it, expect } from "vitest";
import { normalizeResource, normalizeObservation } from "../src/observe/normalize.js";
import type { ObservedResource, SurfaceObservation } from "../src/observe/observe-surface.js";

function mcpResource(
  value: unknown,
  overrides: Partial<ObservedResource> = {},
): ObservedResource {
  return {
    surface: "claude-code",
    kind: "mcp-server",
    scope: "project",
    name: "postgres",
    value,
    provenance: { file: "/project/.mcp.json", formatId: "json-mcpservers" },
    ...overrides,
  };
}

function skillResource(
  content: string,
  skillPath: string,
  overrides: Partial<ObservedResource> = {},
): ObservedResource {
  return {
    surface: "claude-code",
    kind: "skill",
    scope: "user",
    name: "research",
    value: { name: "research", skillPath, content },
    provenance: { file: skillPath, formatId: "skills-dir" },
    ...overrides,
  };
}

describe("normalizeResource — mcp-server", () => {
  it("digests the same server identically across claude (implicit stdio) and cursor shapes", () => {
    // Claude-style: implicit stdio, no transport/type key.
    const claude = mcpResource({
      command: "npx",
      args: ["-y", "pg-mcp"],
      env: { DATABASE_URL: "postgres://localhost/db" },
    });
    // Post-read cursor shape: explicit transport.
    const cursor = mcpResource(
      {
        transport: "stdio",
        command: "npx",
        args: ["-y", "pg-mcp"],
        env: { DATABASE_URL: "postgres://localhost/db" },
      },
      {
        surface: "cursor",
        provenance: { file: "/project/.cursor/mcp.json", formatId: "json-mcpservers" },
      },
    );
    const a = normalizeResource(claude);
    const b = normalizeResource(cursor);
    expect(a.digest).toBe(b.digest);
    expect(a.identityKey).toBe(b.identityKey);
  });

  it("rotating a secret env value does not change the digest", () => {
    const a = normalizeResource(mcpResource({ command: "run", env: { API_KEY: "sk-FAKE-1" } }));
    const b = normalizeResource(mcpResource({ command: "run", env: { API_KEY: "sk-FAKE-2" } }));
    expect(a.digest).toBe(b.digest);
  });

  it("renaming an env KEY changes the digest", () => {
    const a = normalizeResource(mcpResource({ command: "run", env: { API_KEY: "sk-FAKE-1" } }));
    const b = normalizeResource(mcpResource({ command: "run", env: { API_TOKEN: "sk-FAKE-1" } }));
    expect(a.digest).not.toBe(b.digest);
  });

  it("a non-secret env value change IS a real diff", () => {
    const a = normalizeResource(mcpResource({ command: "run", env: { PORT: "5432" } }));
    const b = normalizeResource(mcpResource({ command: "run", env: { PORT: "5433" } }));
    expect(a.digest).not.toBe(b.digest);
  });

  it("preserves args order — order is semantic for commands", () => {
    const a = normalizeResource(mcpResource({ command: "run", args: ["-a", "-b"] }));
    const b = normalizeResource(mcpResource({ command: "run", args: ["-b", "-a"] }));
    expect(a.digest).not.toBe(b.digest);
  });

  it("env key declaration order is irrelevant", () => {
    const a = normalizeResource(mcpResource({ command: "run", env: { A: "1", B: "2" } }));
    const b = normalizeResource(mcpResource({ command: "run", env: { B: "2", A: "1" } }));
    expect(a.digest).toBe(b.digest);
  });

  it("drops provenance-only fields (source, version, integrity)", () => {
    const a = normalizeResource(mcpResource({ transport: "stdio", command: "run" }));
    const b = normalizeResource(
      mcpResource({
        transport: "stdio",
        command: "run",
        source: "npm:pg-mcp",
        version: "1.2.3",
        integrity: { sha256: "abc" },
      }),
    );
    expect(a.digest).toBe(b.digest);
  });

  it("keeps enabled:false — it is semantic", () => {
    const a = normalizeResource(mcpResource({ transport: "stdio", command: "run" }));
    const b = normalizeResource(mcpResource({ transport: "stdio", command: "run", enabled: false }));
    expect(a.digest).not.toBe(b.digest);
  });

  it("keeps bearerTokenEnvVar — it names a variable, not a secret value", () => {
    const a = normalizeResource(
      mcpResource({ transport: "http", url: "https://x.test/mcp", bearerTokenEnvVar: "TOKEN_A" }),
    );
    const b = normalizeResource(
      mcpResource({ transport: "http", url: "https://x.test/mcp", bearerTokenEnvVar: "TOKEN_B" }),
    );
    expect(a.digest).not.toBe(b.digest);
  });

  it("url servers: secret headers are placeholdered across rotations, non-secret header changes are real diffs", () => {
    const base = { transport: "http", url: "https://x.test/mcp" };
    const rot1 = normalizeResource(
      mcpResource({ ...base, headers: { Authorization: "Bearer aaaaaaaaaaaaaaaa" } }),
    );
    const rot2 = normalizeResource(
      mcpResource({ ...base, headers: { Authorization: "Bearer bbbbbbbbbbbbbbbb" } }),
    );
    expect(rot1.digest).toBe(rot2.digest);

    const acceptA = normalizeResource(mcpResource({ ...base, headers: { Accept: "application/json" } }));
    const acceptB = normalizeResource(mcpResource({ ...base, headers: { Accept: "text/plain" } }));
    expect(acceptA.digest).not.toBe(acceptB.digest);

    // Header key order is irrelevant.
    const h1 = normalizeResource(
      mcpResource({ ...base, headers: { Accept: "application/json", "X-Client": "harness" } }),
    );
    const h2 = normalizeResource(
      mcpResource({ ...base, headers: { "X-Client": "harness", Accept: "application/json" } }),
    );
    expect(h1.digest).toBe(h2.digest);
  });
});

describe("normalizeResource — mcp-server inline secrets", () => {
  it("env values are placeholdered on value shape alone, despite a neutral key", () => {
    const a = normalizeResource(
      mcpResource({ command: "run", env: { SOME_VAR: "Bearer xxxxxxxxxxxxxxxx" } }),
    );
    expect((a.canonicalForm as { env: Record<string, string> }).env.SOME_VAR).toBe("<secret>");
  });

  it("REFERENCE env values stay verbatim and their identity is semantic", () => {
    const a = normalizeResource(mcpResource({ command: "run", env: { API_KEY: "${MY_KEY}" } }));
    const b = normalizeResource(mcpResource({ command: "run", env: { API_KEY: "${OTHER_KEY}" } }));
    expect((a.canonicalForm as { env: Record<string, string> }).env.API_KEY).toBe("${MY_KEY}");
    expect(a.digest).not.toBe(b.digest);
  });

  it("inline sensitive flags keep the flag name but placeholder the value", () => {
    const rot1 = normalizeResource(
      mcpResource({ command: "run", args: ["--api-key=sk-FAKE-aaaaaaaaaaaaaaaa"] }),
    );
    const rot2 = normalizeResource(
      mcpResource({ command: "run", args: ["--api-key=sk-FAKE-bbbbbbbbbbbbbbbb"] }),
    );
    expect((rot1.canonicalForm as { args: string[] }).args).toEqual(["--api-key=<secret>"]);
    expect(rot1.digest).toBe(rot2.digest);

    // A flag RENAME is still a real diff.
    const renamed = normalizeResource(
      mcpResource({ command: "run", args: ["--token=sk-FAKE-aaaaaaaaaaaaaaaa"] }),
    );
    expect(rot1.digest).not.toBe(renamed.digest);
  });

  it("a bare sensitive flag placeholders the NEXT element, order preserved", () => {
    const a = normalizeResource(
      mcpResource({ command: "run", args: ["--verbose", "--token", "hunter2", "--out", "x"] }),
    );
    expect((a.canonicalForm as { args: string[] }).args).toEqual([
      "--verbose",
      "--token",
      "<secret>",
      "--out",
      "x",
    ]);
  });

  it("an element matching a credential value shape is placeholdered", () => {
    const a = normalizeResource(
      mcpResource({ command: "run", args: ["ghp_abcdefghijklmnopqrstu", "input.txt"] }),
    );
    expect((a.canonicalForm as { args: string[] }).args).toEqual(["<secret>", "input.txt"]);
  });

  it("url userinfo is placeholdered; host/path changes remain real diffs", () => {
    const rot1 = normalizeResource(
      mcpResource({ transport: "http", url: "https://user:sk-one@x.test/mcp" }),
    );
    const rot2 = normalizeResource(
      mcpResource({ transport: "http", url: "https://user:sk-two@x.test/mcp" }),
    );
    expect((rot1.canonicalForm as { url: string }).url).toBe("https://<secret>@x.test/mcp");
    expect(rot1.digest).toBe(rot2.digest);

    const otherPath = normalizeResource(
      mcpResource({ transport: "http", url: "https://user:sk-one@x.test/other" }),
    );
    expect(rot1.digest).not.toBe(otherPath.digest);

    const plain = normalizeResource(mcpResource({ transport: "http", url: "https://x.test/mcp" }));
    expect((plain.canonicalForm as { url: string }).url).toBe("https://x.test/mcp");
  });
});

describe("normalizeResource — codec agreement", () => {
  it("codex-TOML- and opencode-shaped values agree with the whitelist", () => {
    // CodexMcpValue: McpServer & { bearerTokenEnvVar?: string }
    const codex = normalizeResource(
      mcpResource(
        { transport: "http", url: "https://x.test/mcp", bearerTokenEnvVar: "MCP_TOKEN" },
        { provenance: { file: "/home/u/.codex/config.toml", formatId: "toml-codex" } },
      ),
    );
    expect(codex.canonicalForm).toEqual({
      transport: "http",
      url: "https://x.test/mcp",
      bearerTokenEnvVar: "MCP_TOKEN",
    });

    // OpenCodeMcpValue: McpServer & { enabled?: false }
    const opencode = normalizeResource(
      mcpResource(
        { transport: "stdio", command: "npx", args: ["-y", "pg-mcp"], enabled: false },
        { provenance: { file: "/project/opencode.json", formatId: "json-opencode" } },
      ),
    );
    expect(opencode.canonicalForm).toEqual({
      transport: "stdio",
      command: "npx",
      args: ["-y", "pg-mcp"],
      enabled: false,
    });

    // The same servers minus codec-specific extras digest like plain shapes.
    const plainHttp = normalizeResource(mcpResource({ transport: "http", url: "https://x.test/mcp" }));
    expect(plainHttp.digest).not.toBe(codex.digest); // bearerTokenEnvVar is semantic
    const plainStdio = normalizeResource(
      mcpResource({ transport: "stdio", command: "npx", args: ["-y", "pg-mcp"] }),
    );
    expect(plainStdio.digest).not.toBe(opencode.digest); // enabled:false is semantic
  });
});

describe("normalizeResource — skill", () => {
  const CONTENT = "---\nname: research\n---\n\n# Research\n\nDo research.\n";

  it("digests identically across directory layouts (skillPath differs)", () => {
    const a = normalizeResource(skillResource(CONTENT, "/home/u/.claude/skills/research/SKILL.md"));
    const b = normalizeResource(skillResource(CONTENT, "/home/u/.agents/skills/research/SKILL.md"));
    expect(a.digest).toBe(b.digest);
  });

  it("a body edit changes the digest", () => {
    const a = normalizeResource(skillResource(CONTENT, "/x/SKILL.md"));
    const b = normalizeResource(skillResource(CONTENT.replace("Do research.", "Do more research."), "/x/SKILL.md"));
    expect(a.digest).not.toBe(b.digest);
  });

  it("line-ending and trailing-whitespace differences do not change the digest", () => {
    const crlf = CONTENT.replace(/\n/g, "\r\n");
    const trailing = CONTENT.replace("# Research", "# Research   ") + "\n\n";
    const a = normalizeResource(skillResource(CONTENT, "/x/SKILL.md"));
    const b = normalizeResource(skillResource(crlf, "/y/SKILL.md"));
    const c = normalizeResource(skillResource(trailing, "/z/SKILL.md"));
    expect(a.digest).toBe(b.digest);
    expect(a.digest).toBe(c.digest);
  });
});

describe("normalizeResource — instructions", () => {
  it("normalizes whitespace like skills", () => {
    const a = normalizeResource({
      surface: "claude-code",
      kind: "instructions",
      scope: "project",
      name: "CLAUDE.md",
      value: { content: "# Rules\n\nBe good.\n" },
      provenance: { file: "/project/CLAUDE.md", formatId: "markdown-instructions" },
    });
    const b = normalizeResource({
      surface: "cursor",
      kind: "instructions",
      scope: "project",
      name: "CLAUDE.md",
      value: { content: "# Rules\r\n\r\nBe good.   \r\n\r\n" },
      provenance: { file: "/project/.cursor/rules/CLAUDE.md", formatId: "markdown-instructions" },
    });
    expect(a.digest).toBe(b.digest);
  });
});

describe("identity", () => {
  it("identityKey is kind:name, lowercased and trimmed", () => {
    const a = normalizeResource(mcpResource({ command: "run" }, { name: "Postgres" }));
    const b = normalizeResource(mcpResource({ command: "run" }, { name: " postgres " }));
    expect(a.identityKey).toBe("mcp-server:postgres");
    expect(a.identityKey).toBe(b.identityKey);
  });

  it("same identityKey with digest mismatch means content differs", () => {
    const a = normalizeResource(mcpResource({ command: "run" }));
    const b = normalizeResource(mcpResource({ command: "run", args: ["-v"] }));
    expect(a.identityKey).toBe(b.identityKey);
    expect(a.digest).not.toBe(b.digest);
  });

  it("different kinds never share an identityKey", () => {
    const a = normalizeResource(mcpResource({ command: "run" }, { name: "research" }));
    const b = normalizeResource(skillResource("hello", "/x/SKILL.md"));
    expect(a.identityKey).not.toBe(b.identityKey);
  });
});

describe("normalizeResource — permissions / json-generic kinds", () => {
  it("deep key-sorts objects, keeps arrays in order", () => {
    const base: ObservedResource = {
      surface: "claude-code",
      kind: "permissions",
      scope: "project",
      name: "permissions",
      value: { allow: ["Bash(npm:*)", "Read"], deny: [] },
      provenance: { file: "/project/.claude/settings.json", formatId: "json-generic" },
    };
    const reordered = { ...base, value: { deny: [], allow: ["Bash(npm:*)", "Read"] } };
    const arrayReordered = { ...base, value: { allow: ["Read", "Bash(npm:*)"], deny: [] } };
    expect(normalizeResource(base).digest).toBe(normalizeResource(reordered).digest);
    expect(normalizeResource(base).digest).not.toBe(normalizeResource(arrayReordered).digest);
  });

  it("passes values through the secret-placeholder check", () => {
    const make = (token: string): ObservedResource => ({
      surface: "claude-code",
      kind: "permissions",
      scope: "project",
      name: "permissions",
      value: { apiKey: token },
      provenance: { file: "/project/.claude/settings.json", formatId: "json-generic" },
    });
    const a = normalizeResource(make("sk-FAKE-000000000000001"));
    const b = normalizeResource(make("sk-FAKE-000000000000002"));
    expect(a.digest).toBe(b.digest);
    expect(a.canonicalForm).toEqual({ apiKey: "<secret>" });
  });
});

describe("normalizeObservation", () => {
  it("maps every resource and preserves scope/provenance/needsConfirmation", () => {
    const obs: SurfaceObservation = {
      surface: "claude-code",
      detected: true,
      resources: [
        mcpResource({ command: "run" }, { needsConfirmation: true }),
        skillResource("skill body", "/x/SKILL.md"),
      ],
      skipped: [],
    };
    const normalized = normalizeObservation(obs);
    expect(normalized).toHaveLength(2);
    expect(normalized[0].needsConfirmation).toBe(true);
    expect(normalized[0].scope).toBe("project");
    expect(normalized[0].provenance).toEqual({ file: "/project/.mcp.json", formatId: "json-mcpservers" });
    expect(normalized[1].needsConfirmation).toBeUndefined();
    expect(normalized[1].scope).toBe("user");
    expect(normalized[1].surface).toBe("claude-code");
  });
});

describe("canonicalForm invariants", () => {
  it("is JSON-round-trip stable", () => {
    const resources: ObservedResource[] = [
      mcpResource({
        command: "npx",
        args: ["-y", "pg-mcp"],
        env: { API_KEY: "sk-FAKE-1", PORT: "5432" },
        source: "npm:x",
        enabled: false,
      }),
      skillResource("# Skill\r\nbody  \r\n\r\n", "/x/SKILL.md"),
      {
        surface: "claude-code",
        kind: "permissions",
        scope: "project",
        name: "permissions",
        value: { nested: { z: 1, a: [{ b: 2, undef: undefined }] } },
        provenance: { file: "/p/settings.json", formatId: "json-generic" },
      },
    ];
    for (const resource of resources) {
      const { canonicalForm } = normalizeResource(resource);
      expect(JSON.parse(JSON.stringify(canonicalForm))).toEqual(canonicalForm);
    }
  });
});
