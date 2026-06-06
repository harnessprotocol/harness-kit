/**
 * CLI tests for `harness exchange` commands.
 *
 * Key testing conventions per the rubber-duck review:
 * 1. vi.mock('@inquirer/prompts') — acceptCommand calls select() which blocks
 *    on stdin; tests MUST mock it or they hang indefinitely in CI.
 * 2. --yes flag (auto-accept) is the PRIMARY path for correctness tests.
 *    The interactive select() path is tested in a separate describe block
 *    using the mock.
 * 3. CliTestEnv captures console.log/error and process.exit (which throws).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import { mkdtemp, writeFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { keygenCommand, offerCommand, acceptCommand } from "../src/commands/exchange.js";
import { generate, buildOffer, fingerprint } from "@harness-kit/exchange";
import { CliTestEnv } from "./helpers/cli-test-env.js";

// REQUIRED: mock @inquirer/prompts before any test that calls acceptCommand
// without --yes. Without this, select() blocks waiting for stdin and tests hang.
vi.mock("@inquirer/prompts", () => ({
  select: vi.fn(),
  input: vi.fn(),
  confirm: vi.fn(),
}));

// Re-import select after mocking so tests can configure it per-test
const { select } = await import("@inquirer/prompts");

// ─── fixtures ────────────────────────────────────────────────────────────────

const VALID_FRAGMENT = {
  version: "1",
  kind: "fragment",
  metadata: { name: "postgres-mcp", description: "PostgreSQL MCP server" },
  "mcp-servers": {
    postgres: {
      transport: "stdio",
      command: "uvx",
      args: ["mcp-server-postgres", "--connection-string", "${DB_CONNECTION_STRING}"],
    },
  },
  env: [
    {
      name: "DB_CONNECTION_STRING",
      description: "PostgreSQL connection string",
      required: true,
      sensitive: true,
    },
  ],
};

const FRAGMENT_YAML = `version: "1"
kind: fragment
metadata:
  name: postgres-mcp
  description: PostgreSQL MCP server
mcp-servers:
  postgres:
    transport: stdio
    command: uvx
    args:
      - mcp-server-postgres
      - "--connection-string"
      - "\${DB_CONNECTION_STRING}"
env:
  - name: DB_CONNECTION_STRING
    description: PostgreSQL connection string
    required: true
    sensitive: true
`;

const NAMELESS_FRAGMENT_YAML = `version: "1"
kind: fragment
mcp-servers:
  simple:
    transport: stdio
    command: uvx
    args:
      - some-mcp
`;

const PROFILE_YAML = `version: "1"
kind: profile
metadata:
  name: my-profile
  description: A full profile
`;

// ─── test env ────────────────────────────────────────────────────────────────

let env: CliTestEnv;

beforeEach(() => {
  env = new CliTestEnv();
  env.setup();
});

afterEach(() => {
  env.restore();
  vi.restoreAllMocks();
});

// ─── keygen ──────────────────────────────────────────────────────────────────

describe("keygen", () => {
  it("generates and saves a keypair, outputs fingerprint", async () => {
    // Use a temp home so we don't clobber the real ~/.harness/exchange
    const tmpDir = await mkdtemp(join(tmpdir(), "harness-exchange-test-"));
    const origHome = process.env.HOME;
    process.env.HOME = tmpDir;

    try {
      await expect(keygenCommand({ force: true })).rejects.toThrow("process.exit(0)");
      expect(env.exitCode).toBe(0);
      const output = env.getLog();
      expect(output).toContain("blake2b:");
      expect(output).toContain("Fingerprint:");
    } finally {
      process.env.HOME = origHome;
    }
  });

  it("outputs JSON with --json flag", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "harness-exchange-test-"));
    const origHome = process.env.HOME;
    process.env.HOME = tmpDir;

    try {
      await expect(keygenCommand({ force: true, json: true })).rejects.toThrow("process.exit(0)");
      const parsed = JSON.parse(env.getLog());
      expect(parsed.publicKey).toMatch(/^[a-f0-9]{64}$/);
      expect(parsed.fingerprint).toMatch(/^blake2b:/);
    } finally {
      process.env.HOME = origHome;
    }
  });
});

// ─── offer ───────────────────────────────────────────────────────────────────

describe("offer", () => {
  it("BLOCKS if the input is a profile (not a fragment)", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "harness-exchange-test-"));
    const profilePath = join(tmpDir, "profile.harness.yaml");
    await writeFile(profilePath, PROFILE_YAML);

    // Set up a keypair
    process.env.HOME = tmpDir;
    vi.spyOn(await import("@harness-kit/exchange"), "exists").mockReturnValue(true);
    vi.spyOn(await import("@harness-kit/exchange"), "load").mockReturnValue(generate());

    await expect(offerCommand(profilePath, {})).rejects.toThrow("process.exit(1)");
    expect(env.exitCode).toBe(1);
    expect(env.getError()).toContain("kind: fragment");
  });

  it("writes the offer to a file with --out", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "harness-exchange-test-"));
    const fragPath = join(tmpDir, "fragment.harness.yaml");
    const outPath = join(tmpDir, "offer.json");
    await writeFile(fragPath, FRAGMENT_YAML);

    const keypair = generate();
    vi.spyOn(await import("@harness-kit/exchange"), "exists").mockReturnValue(true);
    vi.spyOn(await import("@harness-kit/exchange"), "load").mockReturnValue(keypair);

    await expect(offerCommand(fragPath, { out: outPath, expires: "+1d" })).rejects.toThrow("process.exit(0)");
    expect(env.exitCode).toBe(0);

    const written = JSON.parse(await readFile(outPath, "utf-8"));
    expect(written.version).toBe("1");
    expect(written.type).toBe("offer");
    expect(written.signature).toMatch(/^[a-f0-9]{128}$/);
  });

  it("outputs offer JSON to stdout when --out is not set", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "harness-exchange-test-"));
    const fragPath = join(tmpDir, "fragment.harness.yaml");
    await writeFile(fragPath, FRAGMENT_YAML);

    const keypair = generate();
    vi.spyOn(await import("@harness-kit/exchange"), "exists").mockReturnValue(true);
    vi.spyOn(await import("@harness-kit/exchange"), "load").mockReturnValue(keypair);

    await expect(offerCommand(fragPath, { expires: "+1d" })).rejects.toThrow("process.exit(0)");
    const parsed = JSON.parse(env.getLog());
    expect(parsed.type).toBe("offer");
  });
});

// ─── accept — --yes path (primary correctness path) ──────────────────────────

describe("accept --yes (auto-accept)", () => {
  async function makeOffer(fragmentYaml: string, tmpDir: string): Promise<string> {
    const keypair = generate();
    const fragment: Record<string, unknown> = {};
    // Parse the YAML into a plain object
    const { parse: yamlParse } = await import("yaml");
    const parsed = yamlParse(fragmentYaml) as Record<string, unknown>;
    Object.assign(fragment, parsed);

    const future = new Date();
    future.setDate(future.getDate() + 1);

    const offer = buildOffer(fragment, { sender: keypair, expires: future.toISOString() });
    const offerPath = join(tmpDir, "offer.json");
    await writeFile(offerPath, JSON.stringify(offer, null, 2));
    return offerPath;
  }

  it("accepts a valid offer and writes fragment + extends entry", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "harness-exchange-test-"));
    const targetPath = join(tmpDir, "harness.yaml");
    await writeFile(
      targetPath,
      `version: "1"\nkind: profile\nmetadata:\n  name: test\n  description: test\nextends: []\n`
    );

    const offerPath = await makeOffer(FRAGMENT_YAML, tmpDir);

    await expect(acceptCommand(offerPath, { into: targetPath, yes: true })).rejects.toThrow("process.exit(0)");
    expect(env.exitCode).toBe(0);

    // Verify the target harness now has an extends entry
    const updatedYaml = await readFile(targetPath, "utf-8");
    expect(updatedYaml).toContain(".harness/exchange");
    expect(updatedYaml).toContain("postgres-mcp");
  });

  it("preserves comments in the target harness.yaml (YAML Document API)", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "harness-exchange-test-"));
    const targetPath = join(tmpDir, "harness.yaml");
    // Write a harness with a user comment on the extends array
    await writeFile(
      targetPath,
      `version: "1"\nkind: profile\nmetadata:\n  name: test\n  description: test\nextends: [] # my local fragments\n`
    );

    const offerPath = await makeOffer(FRAGMENT_YAML, tmpDir);
    await expect(acceptCommand(offerPath, { into: targetPath, yes: true })).rejects.toThrow("process.exit(0)");

    const updated = await readFile(targetPath, "utf-8");
    // Comment must survive
    expect(updated).toContain("# my local fragments");
  });

  it("MUST NOT add x- keys to the extends entry (v1 schema stays clean)", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "harness-exchange-test-"));
    const targetPath = join(tmpDir, "harness.yaml");
    await writeFile(
      targetPath,
      `version: "1"\nkind: profile\nmetadata:\n  name: t\n  description: t\nextends: []\n`
    );

    const offerPath = await makeOffer(FRAGMENT_YAML, tmpDir);
    await expect(acceptCommand(offerPath, { into: targetPath, yes: true })).rejects.toThrow("process.exit(0)");

    const updated = await readFile(targetPath, "utf-8");
    // x- provenance keys must NOT appear on the extends entry
    expect(updated).not.toContain("x-exchange-received-from");
    expect(updated).not.toContain("x-exchange-received-at");
  });

  it("stores provenance in a sidecar .meta.json file (not in harness.yaml)", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "harness-exchange-test-"));
    const targetPath = join(tmpDir, "harness.yaml");
    await writeFile(
      targetPath,
      `version: "1"\nkind: profile\nmetadata:\n  name: t\n  description: t\nextends: []\n`
    );

    const offerPath = await makeOffer(FRAGMENT_YAML, tmpDir);
    await expect(acceptCommand(offerPath, { into: targetPath, yes: true })).rejects.toThrow("process.exit(0)");

    // Find the sidecar (meta.json) in the exchange store
    const exchangeDir = join(tmpDir, ".harness", "exchange");
    const exchangeFiles = (await import("node:fs")).readdirSync(exchangeDir);
    const sidecar = exchangeFiles.find((f) => f.endsWith(".meta.json"));
    expect(sidecar).toBeTruthy();

    const meta = JSON.parse(await readFile(join(exchangeDir, sidecar!), "utf-8"));
    expect(meta.receivedFrom).toMatch(/^blake2b:/);
    expect(meta.receivedAt).toBeTruthy();
    expect(meta.edited).toBe(false);
  });

  it("uses a content-hash filename for fragments with no metadata.name", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "harness-exchange-test-"));
    const targetPath = join(tmpDir, "harness.yaml");
    await writeFile(
      targetPath,
      `version: "1"\nkind: profile\nmetadata:\n  name: t\n  description: t\nextends: []\n`
    );

    const offerPath = await makeOffer(NAMELESS_FRAGMENT_YAML, tmpDir);
    await expect(acceptCommand(offerPath, { into: targetPath, yes: true })).rejects.toThrow("process.exit(0)");
    expect(env.exitCode).toBe(0);

    const exchangeDir = join(tmpDir, ".harness", "exchange");
    const exchangeFiles = (await import("node:fs")).readdirSync(exchangeDir);
    const fragFile = exchangeFiles.find((f) => f.endsWith(".harness.yaml"));
    expect(fragFile).toBeTruthy();
    // Filename should start with "fragment-" (the content-hash fallback)
    expect(fragFile).toMatch(/^fragment-[a-f0-9]{8}-/);
  });

  it("BLOCKS an expired offer — exit 1, nothing written", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "harness-exchange-test-"));
    const targetPath = join(tmpDir, "harness.yaml");
    const targetContent = `version: "1"\nkind: profile\nmetadata:\n  name: t\n  description: t\nextends: []\n`;
    await writeFile(targetPath, targetContent);

    // Build an offer that expired in the past
    const keypair = generate();
    const { parse: yamlParse } = await import("yaml");
    const frag = yamlParse(FRAGMENT_YAML) as Record<string, unknown>;
    const offer = buildOffer(frag, { sender: keypair, expires: "2020-01-01T00:00:00Z" });
    const offerPath = join(tmpDir, "offer.json");
    await writeFile(offerPath, JSON.stringify(offer));

    await expect(acceptCommand(offerPath, { into: targetPath, yes: true })).rejects.toThrow("process.exit(1)");
    expect(env.exitCode).toBe(1);
    expect(env.getError()).toMatch(/expired|expir/i);

    // Target must be unchanged
    expect(await readFile(targetPath, "utf-8")).toBe(targetContent);
  });

  it("BLOCKS a tampered offer (signature verification) — exit 1, nothing written", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "harness-exchange-test-"));
    const targetPath = join(tmpDir, "harness.yaml");
    const targetContent = `version: "1"\nkind: profile\nmetadata:\n  name: t\n  description: t\nextends: []\n`;
    await writeFile(targetPath, targetContent);

    const offerPath = await makeOffer(FRAGMENT_YAML, tmpDir);

    // Tamper with a field inside the fragment (the signed content)
    const envelope = JSON.parse(await readFile(offerPath, "utf-8"));
    (envelope.fragment["mcp-servers"] as Record<string, unknown>).postgres = {
      transport: "stdio",
      command: "malicious",
      args: [],
    };
    await writeFile(offerPath, JSON.stringify(envelope));

    await expect(acceptCommand(offerPath, { into: targetPath, yes: true })).rejects.toThrow("process.exit(1)");
    expect(env.exitCode).toBe(1);
    expect(env.getError()).toContain("Signature verification failed");

    // Target must be unchanged
    expect(await readFile(targetPath, "utf-8")).toBe(targetContent);
  });
});

// ─── accept — interactive path (mocked inquirer) ─────────────────────────────

describe("accept — interactive (mocked select)", () => {
  async function makeOffer(tmpDir: string): Promise<string> {
    const keypair = generate();
    const future = new Date();
    future.setDate(future.getDate() + 1);
    const { parse: yamlParse } = await import("yaml");
    const frag = yamlParse(FRAGMENT_YAML) as Record<string, unknown>;
    const offer = buildOffer(frag, { sender: keypair, expires: future.toISOString() });
    const offerPath = join(tmpDir, "offer.json");
    await writeFile(offerPath, JSON.stringify(offer, null, 2));
    return offerPath;
  }

  it("Accept choice applies the fragment", async () => {
    vi.mocked(select).mockResolvedValue("accept" as never);

    const tmpDir = await mkdtemp(join(tmpdir(), "harness-exchange-test-"));
    const targetPath = join(tmpDir, "harness.yaml");
    await writeFile(targetPath, `version: "1"\nkind: profile\nmetadata:\n  name: t\n  description: t\nextends: []\n`);

    const offerPath = await makeOffer(tmpDir);
    await expect(acceptCommand(offerPath, { into: targetPath })).rejects.toThrow("process.exit(0)");
    expect(env.exitCode).toBe(0);
    expect(await readFile(targetPath, "utf-8")).toContain(".harness/exchange");
  });

  it("Reject choice writes nothing and exits 0", async () => {
    vi.mocked(select).mockResolvedValue("reject" as never);

    const tmpDir = await mkdtemp(join(tmpdir(), "harness-exchange-test-"));
    const targetPath = join(tmpDir, "harness.yaml");
    const original = `version: "1"\nkind: profile\nmetadata:\n  name: t\n  description: t\nextends: []\n`;
    await writeFile(targetPath, original);

    const offerPath = await makeOffer(tmpDir);
    await expect(acceptCommand(offerPath, { into: targetPath })).rejects.toThrow("process.exit(0)");
    expect(env.exitCode).toBe(0);
    // Target MUST be unchanged
    expect(await readFile(targetPath, "utf-8")).toBe(original);
    // Nothing written to exchange store
    const exchangeDir = join(tmpDir, ".harness", "exchange");
    expect((await import("node:fs")).existsSync(exchangeDir)).toBe(false);
  });

  it("preview output includes sender fingerprint (not just display name)", async () => {
    vi.mocked(select).mockResolvedValue("reject" as never);

    const tmpDir = await mkdtemp(join(tmpdir(), "harness-exchange-test-"));
    const targetPath = join(tmpDir, "harness.yaml");
    await writeFile(targetPath, `version: "1"\nkind: profile\nmetadata:\n  name: t\n  description: t\nextends: []\n`);

    const offerPath = await makeOffer(tmpDir);
    await expect(acceptCommand(offerPath, { into: targetPath })).rejects.toThrow("process.exit(0)");

    const output = env.getLog();
    // Must show the blake2b fingerprint
    expect(output).toMatch(/blake2b:[a-f0-9]{4}:[a-f0-9]{4}:[a-f0-9]{4}:[a-f0-9]{4}/);
    // Must show VERIFIED
    expect(output).toContain("VERIFIED");
  });
});
