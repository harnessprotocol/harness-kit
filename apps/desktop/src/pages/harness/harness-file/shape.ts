import type { HarnessConfig } from "@harness-kit/core";

/**
 * parseHarness accepts any YAML, so a section can arrive in a shape the types
 * do not promise (`plugins: abc`, `env:` as a map, `extends: owner/repo`). The
 * panel renders from the result of `sanitizeConfig`: a section in the wrong
 * shape is left out and named in `malformed`, so it shows as a short note
 * instead of throwing during render.
 */

class Malformed extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Missing is fine; a scalar becomes text; a map or list is the wrong shape. */
function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "object") throw new Malformed();
  return String(v);
}

function bool(v: unknown): boolean | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "boolean") throw new Malformed();
  return v;
}

function obj(v: unknown): Record<string, unknown> {
  if (v === undefined || v === null) return {};
  if (!isObject(v)) throw new Malformed();
  return v;
}

function list(v: unknown): unknown[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Malformed();
  return v;
}

function strList(v: unknown): string[] {
  return list(v).map((item) => {
    const text = str(item);
    if (text === undefined) throw new Malformed();
    return text;
  });
}

const present = (v: unknown) => v !== undefined && v !== null;

type Section = (raw: unknown) => unknown;

const SECTIONS: Record<string, { label: string; read: Section }> = {
  metadata: {
    label: "Metadata",
    read: (raw) => {
      const o = obj(raw);
      return {
        name: str(o.name),
        description: str(o.description),
        version: str(o.version),
        license: str(o.license),
        author: present(o.author) ? { name: str(obj(o.author).name) } : undefined,
        tags: present(o.tags) ? strList(o.tags) : undefined,
      };
    },
  },
  plugins: {
    label: "Plugins",
    read: (raw) =>
      list(raw).map((entry) => {
        const o = obj(entry);
        return { name: str(o.name), source: str(o.source), version: str(o.version), description: str(o.description) };
      }),
  },
  "mcp-servers": {
    label: "MCP Servers",
    read: (raw) =>
      Object.fromEntries(
        Object.entries(obj(raw)).map(([name, server]) => {
          const o = obj(server);
          return [name, { transport: str(o.transport), command: str(o.command), url: str(o.url) }];
        }),
      ),
  },
  env: {
    label: "Environment",
    read: (raw) =>
      list(raw).map((entry) => {
        const o = obj(entry);
        return {
          name: str(o.name),
          description: str(o.description),
          default: str(o.default),
          required: bool(o.required),
          sensitive: bool(o.sensitive),
        };
      }),
  },
  instructions: {
    label: "Instructions",
    read: (raw) => {
      const o = obj(raw);
      return {
        operational: str(o.operational),
        behavioral: str(o.behavioral),
        identity: str(o.identity),
        "import-mode": str(o["import-mode"]),
      };
    },
  },
  permissions: {
    label: "Permissions",
    read: (raw) => {
      const o = obj(raw);
      const tools = obj(o.tools);
      const paths = obj(o.paths);
      const network = obj(o.network);
      return {
        tools: present(o.tools) ? { allow: strList(tools.allow), deny: strList(tools.deny), ask: strList(tools.ask) } : undefined,
        paths: present(o.paths) ? { writable: strList(paths.writable), readonly: strList(paths.readonly) } : undefined,
        network: present(o.network) ? { "allowed-hosts": strList(network["allowed-hosts"]) } : undefined,
      };
    },
  },
  extends: {
    label: "Extends",
    read: (raw) =>
      list(raw).map((entry) => {
        const o = obj(entry);
        return { source: str(o.source), version: str(o.version) };
      }),
  },
};

export interface SanitizedConfig {
  config: HarnessConfig;
  /** Labels of the sections that were not in the expected shape and were left out. */
  malformed: string[];
}

export function sanitizeConfig(config: unknown): SanitizedConfig {
  const source: Record<string, unknown> = isObject(config) ? config : {};
  const out: Record<string, unknown> = {};
  const malformed: string[] = [];
  for (const [key, { label, read }] of Object.entries(SECTIONS)) {
    if (!present(source[key])) continue;
    try {
      out[key] = read(source[key]);
    } catch (e) {
      if (!(e instanceof Malformed)) throw e;
      malformed.push(label);
    }
  }
  return { config: out as unknown as HarnessConfig, malformed };
}

/** For a list prop that may be handed the wrong shape: the list, or empty. */
export function asList<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
