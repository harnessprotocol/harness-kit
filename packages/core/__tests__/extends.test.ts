import { describe, it, expect } from "vitest"
import { fileURLToPath } from "node:url"
import { resolve as resolvePath } from "node:path"
import { resolveExtends } from "../src/compile/extends.js"
import { compile } from "../src/compile/compile.js"
import { parseHarness } from "../src/parser/parse-harness.js"
import { validateHarness } from "../src/schema/validate.js"
import { NodeFsProvider } from "../src/fs-node.js"
import { MockFsProvider } from "./helpers/mock-fs.js"
import type { HarnessConfig } from "../src/types.js"

// ── YAML helpers ──────────────────────────────────────────────

const BASE_FRAGMENT_YAML = `\
$schema: https://harnessprotocol.io/schema/v1/harness.schema.json
version: "1"
kind: fragment
metadata:
  name: postgres-fragment
  description: Postgres fragment
mcp-servers:
  postgres:
    transport: stdio
    command: uvx
    args: [mcp-server-postgres]
`

const BASE_PROFILE_YAML = `\
$schema: https://harnessprotocol.io/schema/v1/harness.schema.json
version: "1"
kind: profile
metadata:
  name: test-profile
  description: Test profile
`

// ── Minimal config builder ────────────────────────────────────

function makeConfig(overrides: Partial<HarnessConfig> = {}): HarnessConfig {
  return {
    version: "1",
    kind: "profile",
    metadata: { name: "test-profile", description: "Test profile" },
    ...overrides,
  }
}

// ── Core behavior ─────────────────────────────────────────────

describe("resolveExtends — no extends field", () => {
  it("returns config unchanged when no extends field is present", async () => {
    const fs = new MockFsProvider()
    const config = makeConfig()
    const result = await resolveExtends(config, fs, "/project")
    expect(result).toEqual(config)
  })
})

describe("resolveExtends — empty extends array", () => {
  it("returns config unchanged when extends is empty array", async () => {
    const fs = new MockFsProvider()
    const config = makeConfig({ extends: [] })
    const result = await resolveExtends(config, fs, "/project")
    expect(result["mcp-servers"]).toBeUndefined()
  })
})

describe("resolveExtends — mcp-servers merge", () => {
  it("adds fragment mcp-servers when profile has none", async () => {
    const fs = new MockFsProvider({
      "/project/.harness/exchange/postgres.harness.yaml": BASE_FRAGMENT_YAML,
    })
    const config = makeConfig({
      extends: [{ source: "./.harness/exchange/postgres.harness.yaml" }],
    })

    const result = await resolveExtends(config, fs, "/project")
    expect(result["mcp-servers"]).toBeDefined()
    expect(result["mcp-servers"]!.postgres).toBeDefined()
  })

  it("child mcp-servers entry wins on conflict", async () => {
    const fragmentYaml = `\
$schema: https://harnessprotocol.io/schema/v1/harness.schema.json
version: "1"
kind: fragment
metadata:
  name: frag
  description: frag
mcp-servers:
  postgres:
    transport: stdio
    command: uvx
    args: [mcp-server-postgres]
`
    const fs = new MockFsProvider({
      "/project/frag.harness.yaml": fragmentYaml,
    })
    const config = makeConfig({
      "mcp-servers": {
        postgres: {
          transport: "stdio",
          command: "pg-custom",
          args: ["--port", "5433"],
        },
      },
      extends: [{ source: "./frag.harness.yaml" }],
    })

    const result = await resolveExtends(config, fs, "/project")
    const server = result["mcp-servers"]!.postgres as { command: string }
    expect(server.command).toBe("pg-custom")
  })
})

// ── Env merge ─────────────────────────────────────────────────

describe("resolveExtends — env union", () => {
  it("unions env entries from fragment and profile", async () => {
    const fragmentYaml = `\
$schema: https://harnessprotocol.io/schema/v1/harness.schema.json
version: "1"
kind: fragment
metadata:
  name: frag
  description: frag
env:
  - name: DB_CONNECTION_STRING
    description: PostgreSQL connection string
    required: true
`
    const fs = new MockFsProvider({
      "/project/frag.harness.yaml": fragmentYaml,
    })
    const config = makeConfig({
      env: [{ name: "LOCAL_PATH", description: "Local path", required: false }],
      extends: [{ source: "./frag.harness.yaml" }],
    })

    const result = await resolveExtends(config, fs, "/project")
    const names = result.env!.map((e) => e.name)
    expect(names).toContain("DB_CONNECTION_STRING")
    expect(names).toContain("LOCAL_PATH")
  })

  it("child env entry wins on name conflict", async () => {
    const fragmentYaml = `\
$schema: https://harnessprotocol.io/schema/v1/harness.schema.json
version: "1"
kind: fragment
metadata:
  name: frag
  description: frag
env:
  - name: DB_URL
    description: Fragment DB URL
    required: true
`
    const fs = new MockFsProvider({
      "/project/frag.harness.yaml": fragmentYaml,
    })
    const config = makeConfig({
      env: [{ name: "DB_URL", description: "Profile DB URL", required: false }],
      extends: [{ source: "./frag.harness.yaml" }],
    })

    const result = await resolveExtends(config, fs, "/project")
    const entry = result.env!.find((e) => e.name === "DB_URL")!
    expect(entry.description).toBe("Profile DB URL")
  })
})

// ── Instructions merge ────────────────────────────────────────

describe("resolveExtends — instructions merge", () => {
  it("import-mode merge: fragment operational instructions appear before profile's", async () => {
    const fragmentYaml = `\
$schema: https://harnessprotocol.io/schema/v1/harness.schema.json
version: "1"
kind: fragment
metadata:
  name: frag
  description: frag
instructions:
  operational: |
    Fragment operational content
`
    const fs = new MockFsProvider({
      "/project/frag.harness.yaml": fragmentYaml,
    })
    const config = makeConfig({
      instructions: {
        operational: "Profile operational content",
        "import-mode": "merge",
      },
      extends: [{ source: "./frag.harness.yaml" }],
    })

    const result = await resolveExtends(config, fs, "/project")
    const operational = result.instructions!.operational!
    const fragIdx = operational.indexOf("Fragment operational content")
    const profileIdx = operational.indexOf("Profile operational content")
    expect(fragIdx).toBeGreaterThanOrEqual(0)
    expect(profileIdx).toBeGreaterThan(fragIdx)
  })

  it("import-mode replace: profile instructions completely replace fragment instructions", async () => {
    const fragmentYaml = `\
$schema: https://harnessprotocol.io/schema/v1/harness.schema.json
version: "1"
kind: fragment
metadata:
  name: frag
  description: frag
instructions:
  operational: |
    Fragment operational content
`
    const fs = new MockFsProvider({
      "/project/frag.harness.yaml": fragmentYaml,
    })
    const config = makeConfig({
      instructions: {
        operational: "Profile operational content",
        "import-mode": "replace",
      },
      extends: [{ source: "./frag.harness.yaml" }],
    })

    const result = await resolveExtends(config, fs, "/project")
    const operational = result.instructions!.operational!
    expect(operational).not.toContain("Fragment operational content")
    expect(operational).toContain("Profile operational content")
  })

  it("import-mode skip: fragment instructions pass through unchanged, profile contributes nothing", async () => {
    const fragmentYaml = `\
$schema: https://harnessprotocol.io/schema/v1/harness.schema.json
version: "1"
kind: fragment
metadata:
  name: frag
  description: frag
instructions:
  operational: |
    Fragment operational content
`
    const fs = new MockFsProvider({
      "/project/frag.harness.yaml": fragmentYaml,
    })
    const config = makeConfig({
      instructions: {
        operational: "Profile operational content",
        "import-mode": "skip",
      },
      extends: [{ source: "./frag.harness.yaml" }],
    })

    const result = await resolveExtends(config, fs, "/project")
    const operational = result.instructions!.operational!
    expect(operational).toContain("Fragment operational content")
    expect(operational).not.toContain("Profile operational content")
  })
})

// ── Permissions ───────────────────────────────────────────────

describe("resolveExtends — permissions", () => {
  it("tools.allow intersection: resolved allow is subset common to both", async () => {
    const fragmentYaml = `\
$schema: https://harnessprotocol.io/schema/v1/harness.schema.json
version: "1"
kind: fragment
metadata:
  name: frag
  description: frag
permissions:
  tools:
    allow:
      - Read
      - Grep
      - Write
`
    const fs = new MockFsProvider({
      "/project/frag.harness.yaml": fragmentYaml,
    })
    const config = makeConfig({
      permissions: {
        tools: { allow: ["Read", "Grep"] },
      },
      extends: [{ source: "./frag.harness.yaml" }],
    })

    const result = await resolveExtends(config, fs, "/project")
    const allow = result.permissions!.tools!.allow!
    expect(allow).toContain("Read")
    expect(allow).toContain("Grep")
    expect(allow).not.toContain("Write")
  })

  it("tools.allow: child inherits parent allow unchanged when child has none", async () => {
    const fragmentYaml = `\
$schema: https://harnessprotocol.io/schema/v1/harness.schema.json
version: "1"
kind: fragment
metadata:
  name: frag
  description: frag
permissions:
  tools:
    allow:
      - Read
      - Grep
      - Write
`
    const fs = new MockFsProvider({
      "/project/frag.harness.yaml": fragmentYaml,
    })
    const config = makeConfig({
      extends: [{ source: "./frag.harness.yaml" }],
    })

    const result = await resolveExtends(config, fs, "/project")
    const allow = result.permissions!.tools!.allow!
    expect(allow).toContain("Read")
    expect(allow).toContain("Grep")
    expect(allow).toContain("Write")
  })

  it("tools.deny union: resolved deny includes entries from both parent and child", async () => {
    const fragmentYaml = `\
$schema: https://harnessprotocol.io/schema/v1/harness.schema.json
version: "1"
kind: fragment
metadata:
  name: frag
  description: frag
permissions:
  tools:
    deny:
      - "mcp__*__drop_*"
`
    const fs = new MockFsProvider({
      "/project/frag.harness.yaml": fragmentYaml,
    })
    const config = makeConfig({
      permissions: {
        tools: { deny: ["Bash"] },
      },
      extends: [{ source: "./frag.harness.yaml" }],
    })

    const result = await resolveExtends(config, fs, "/project")
    const deny = result.permissions!.tools!.deny!
    expect(deny).toContain("Bash")
    expect(deny).toContain("mcp__*__drop_*")
  })

  it("paths.writable union: resolved writable includes paths from both parent and child", async () => {
    const fragmentYaml = `\
$schema: https://harnessprotocol.io/schema/v1/harness.schema.json
version: "1"
kind: fragment
metadata:
  name: frag
  description: frag
permissions:
  paths:
    writable:
      - sql/
      - migrations/
`
    const fs = new MockFsProvider({
      "/project/frag.harness.yaml": fragmentYaml,
    })
    const config = makeConfig({
      permissions: {
        paths: { writable: ["src/"] },
      },
      extends: [{ source: "./frag.harness.yaml" }],
    })

    const result = await resolveExtends(config, fs, "/project")
    const writable = result.permissions!.paths!.writable!
    expect(writable).toContain("sql/")
    expect(writable).toContain("migrations/")
    expect(writable).toContain("src/")
  })
})

// ── Error handling ────────────────────────────────────────────

describe("resolveExtends — error handling", () => {
  it("throws a clear error when a local fragment file does not exist", async () => {
    const fs = new MockFsProvider()
    const config = makeConfig({
      extends: [{ source: "./missing-fragment.harness.yaml" }],
    })

    await expect(
      resolveExtends(config, fs, "/project"),
    ).rejects.toThrow()
  })

  it("skips without throwing when extends source is a remote (owner/repo) reference", async () => {
    const fs = new MockFsProvider()
    const config = makeConfig({
      extends: [{ source: "owner/repo" }],
    })

    await expect(resolveExtends(config, fs, "/project")).resolves.toBeDefined()
  })

  it("throws on circular extends", async () => {
    const fragmentA = `\
$schema: https://harnessprotocol.io/schema/v1/harness.schema.json
version: "1"
kind: fragment
metadata:
  name: fragment-a
  description: Fragment A
extends:
  - source: ./harness.yaml
`
    const profileYaml = `\
$schema: https://harnessprotocol.io/schema/v1/harness.schema.json
version: "1"
kind: profile
metadata:
  name: test-profile
  description: Test profile
extends:
  - source: ./fragment-a.harness.yaml
`
    const fs = new MockFsProvider({
      "/project/harness.yaml": profileYaml,
      "/project/fragment-a.harness.yaml": fragmentA,
    })

    // Parse the profile to get a HarnessConfig with extends
    const config = makeConfig({
      extends: [{ source: "./fragment-a.harness.yaml" }],
    })

    await expect(
      resolveExtends(config, fs, "/project"),
    ).rejects.toThrow()
  })
})

// ── Integration test ──────────────────────────────────────────

describe("compile reflects accepted fragment", () => {
  it("compiled output mcp-servers FileAction includes the postgres server from fragment", async () => {
    const fragmentYaml = `\
$schema: https://harnessprotocol.io/schema/v1/harness.schema.json
version: "1"
kind: fragment
metadata:
  name: postgres-fragment
  description: Postgres fragment
mcp-servers:
  postgres:
    transport: stdio
    command: uvx
    args: [mcp-server-postgres]
`

    const profileYaml = `\
$schema: https://harnessprotocol.io/schema/v1/harness.schema.json
version: "1"
kind: profile
metadata:
  name: test-profile
  description: Test profile
extends:
  - source: ./.harness/exchange/postgres-fragment.harness.yaml
instructions:
  operational: |
    Be helpful.
  import-mode: merge
`

    const fs = new MockFsProvider({
      "/project/.harness/exchange/postgres-fragment.harness.yaml": fragmentYaml,
    })

    const result = await compile(profileYaml, ["claude-code"], fs, { dryRun: true })

    const mcpFile = result.files.find((f) => f.slot === "mcp-servers")
    expect(mcpFile).toBeDefined()

    const parsed = JSON.parse(mcpFile!.content)
    expect(parsed.mcpServers.postgres).toBeDefined()
    expect(parsed.mcpServers.postgres.command).toBe("uvx")
  })
})

// ── Repo showcase integration test ──────────────────────────────
//
// The repo-root harness.yaml extends ./profiles/full-stack-engineer.yaml and
// is the showcase for what a real Harness Protocol v1 profile looks like.
// This reads both real files off disk (NodeFsProvider) so a future edit to
// either file, or to the merge logic above, fails CI instead of silently
// shipping a broken showcase.

const REPO_ROOT = resolvePath(fileURLToPath(import.meta.url), "../../../..")

describe("resolveExtends — repo showcase (root harness.yaml)", () => {
  it("resolves harness.yaml's extends of profiles/full-stack-engineer.yaml into a schema-valid, correctly merged config", async () => {
    const fs = new NodeFsProvider(REPO_ROOT)
    const raw = await fs.readFile(fs.joinPath(REPO_ROOT, "harness.yaml"))
    const { config } = parseHarness(raw)

    const result = await resolveExtends(config, fs, REPO_ROOT)

    const validation = validateHarness(result)
    expect(validation.errors).toEqual([])
    expect(validation.valid).toBe(true)

    // Plugins declared directly on the root harness.yaml.
    const localPluginNames = [
      "rubber-ducky",
      "research",
      "dependabot-sweep",
      "stats",
    ]
    // Plugins inherited from profiles/full-stack-engineer.yaml.
    const inheritedPluginNames = [
      "review",
      "open-pr",
      "merge-pr",
      "pr-sweep",
      "explain",
      "docgen",
      "harness-share",
      "membrain",
    ]

    const pluginNames = (result.plugins ?? []).map((p) => p.name)
    expect(pluginNames.sort()).toEqual(
      [...localPluginNames, ...inheritedPluginNames].sort(),
    )
    // Deduped: no plugin name appears more than once in the merged list.
    expect(new Set(pluginNames).size).toBe(pluginNames.length)

    // The root harness.yaml's own local-only mcp-servers entry must survive
    // the merge (the profile declares none).
    expect(result["mcp-servers"]?.github).toBeDefined()

    // Instructions merge (default import-mode): profile text precedes the
    // root's own text in both slots.
    const operational = result.instructions!.operational as string
    const profileIdx = operational.indexOf("Read existing code before writing")
    const localIdx = operational.indexOf("Build with pnpm from the repo root")
    expect(profileIdx).toBeGreaterThanOrEqual(0)
    expect(localIdx).toBeGreaterThan(profileIdx)

    // Permissions declared only on the root harness.yaml must survive the
    // merge (the profile declares no permissions block).
    expect(result.permissions!.tools!.allow).toContain("Bash(pnpm:*)")
  })
})
