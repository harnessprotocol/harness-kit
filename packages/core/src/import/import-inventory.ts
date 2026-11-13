import { stringify as stringifyYaml } from "yaml";
import type { FsProvider } from "../fs-provider.js";
import type { HarnessConfig, HarnessPermissions, McpServer } from "../types.js";
import type { SurfaceDescriptor } from "../surfaces/types.js";
import { SURFACES } from "../surfaces/registry.js";
import { computeMachineInventory, type MachineInventory } from "../observe/machine-inventory.js";
import { observeAllSurfaces, type ObserveOptions } from "../observe/observe-surface.js";
import { normalizeObservation, SECRET_PLACEHOLDER, type NormalizedResource } from "../observe/normalize.js";
import { CURRENT_PROTOCOL_VERSION } from "../utils/protocol-version.js";
import { isRecord } from "../utils/is-record.js";

export interface InventoryImportMeta {
  /** harness.yaml metadata.name. */
  name?: string;
  /** harness.yaml metadata.description. */
  description?: string;
}

export interface InventoryImportResult {
  /** The same inventory `buildMachineInventory` returns for these inputs: what the Machine grid shows. */
  inventory: MachineInventory;
  harnessConfig: HarnessConfig;
  harnessYaml: string;
}

function referenceName(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
}

/**
 * Replace the inventory's `<secret>` placeholder with a `${NAME}` reference so
 * the written file never carries a value that would break the server. An env
 * var uses its own key as NAME; a header uses `<SERVER>_<HEADER>` because a
 * header name is not an environment variable name.
 */
function referenceSecrets(values: Record<string, string>, nameFor: (key: string) => string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      typeof value === "string" ? value.replaceAll(SECRET_PLACEHOLDER, `\${${nameFor(key)}}`) : value,
    ]),
  );
}

/** An MCP server's canonical form (observe/normalize.ts) back to a harness.yaml server, or null to skip it. */
function toMcpServerNamed(serverName: string, form: unknown): McpServer | null {
  const server = toMcpServer(form);
  if (!server) return null;
  if (server.transport === "stdio") {
    return server.env ? { ...server, env: referenceSecrets(server.env, (key) => key) } : server;
  }
  return server.headers
    ? { ...server, headers: referenceSecrets(server.headers, (key) => `${referenceName(serverName)}_${referenceName(key)}`) }
    : server;
}

function toMcpServer(form: unknown): McpServer | null {
  if (!isRecord(form)) return null;
  // A disabled server is not part of the setup the grid reports as active;
  // writing it back without the flag would turn it on.
  if (form.enabled === false) return null;
  const transport = form.transport;
  if (transport === "stdio") {
    if (typeof form.command !== "string") return null;
    return {
      transport: "stdio",
      command: form.command,
      ...(Array.isArray(form.args) ? { args: form.args as string[] } : {}),
      ...(isRecord(form.env) && Object.keys(form.env).length > 0 ? { env: form.env as Record<string, string> } : {}),
    };
  }
  if (transport === "http" || transport === "sse" || transport === "ws") {
    if (typeof form.url !== "string") return null;
    return {
      transport,
      url: form.url,
      ...(isRecord(form.headers) && Object.keys(form.headers).length > 0
        ? { headers: form.headers as Record<string, string> }
        : {}),
    };
  }
  return null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function union(...lists: string[][]): string[] {
  return [...new Set(lists.flat())];
}

/** Claude Code's `permissions` block (allow/deny/additionalDirectories) from settings-style permission rows. */
function toPermissions(resources: NormalizedResource[]): HarnessPermissions | undefined {
  const blocks = resources
    .filter((r) => r.kind === "permissions" && isRecord(r.canonicalForm) && isRecord(r.canonicalForm.permissions))
    .map((r) => (r.canonicalForm as { permissions: Record<string, unknown> }).permissions);
  const allow = union(...blocks.map((b) => stringList(b.allow)));
  const deny = union(...blocks.map((b) => stringList(b.deny)));
  const writable = union(...blocks.map((b) => stringList(b.additionalDirectories)));
  const permissions: HarnessPermissions = {};
  if (allow.length > 0 || deny.length > 0) {
    permissions.tools = { ...(allow.length > 0 ? { allow } : {}), ...(deny.length > 0 ? { deny } : {}) };
  }
  if (writable.length > 0) permissions.paths = { writable };
  return Object.keys(permissions).length > 0 ? permissions : undefined;
}

/**
 * Build a harness.yaml from the machine inventory (AC-56): observe every
 * surface once, fold the observations into the grid's inventory, and derive
 * the document from those same normalized resources, so onboarding and
 * "Generate from Claude Code setup" cannot disagree with the Machine grid.
 *
 * Covers MCP servers and permissions. Values are the inventory's
 * secret-sanitized canonical forms: a credential-shaped env or header value is
 * written as a `${NAME}` reference, never verbatim and never as the literal
 * `<secret>` placeholder (which would break the server once compiled). When the same server is on several surfaces the
 * first in registry order wins (project scope over user scope); the
 * inventory's `diffs` list the disagreements.
 */
export async function importFromInventory(
  fs: FsProvider,
  opts: ObserveOptions,
  surfaces: readonly SurfaceDescriptor[] = SURFACES,
  meta: InventoryImportMeta = {},
): Promise<InventoryImportResult> {
  const observations = await observeAllSurfaces(fs, opts, [...surfaces]);
  const inventory = computeMachineInventory(observations, surfaces);
  const resources = observations.flatMap(normalizeObservation);

  const mcpServers: Record<string, McpServer> = {};
  const ordered = [...resources.filter((r) => r.scope === "project"), ...resources.filter((r) => r.scope !== "project")];
  for (const resource of ordered) {
    if (resource.kind !== "mcp-server" || resource.name in mcpServers) continue;
    const server = toMcpServerNamed(resource.name, resource.canonicalForm);
    if (server) mcpServers[resource.name] = server;
  }
  const sortedServers = Object.fromEntries(Object.entries(mcpServers).sort(([a], [b]) => a.localeCompare(b)));
  const permissions = toPermissions(resources);

  const harnessConfig: HarnessConfig = {
    $schema: "https://harnessprotocol.io/schema/v2/harness.schema.json",
    version: CURRENT_PROTOCOL_VERSION,
    kind: "profile",
    scope: opts.projectRoot === null ? "personal" : "project",
    metadata: {
      name: meta.name ?? "imported",
      description: meta.description ?? "Built from this machine's inventory by harness-kit.",
    },
    ...(Object.keys(sortedServers).length > 0 ? { "mcp-servers": sortedServers } : {}),
    ...(permissions ? { permissions } : {}),
  };

  return { inventory, harnessConfig, harnessYaml: stringifyYaml(harnessConfig, { lineWidth: 0 }) };
}
