import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { parseHarness } from "@harness-kit/core";
import type { McpServer } from "@harness-kit/core";
import {
  readMcpConfig,
  writeMcpConfig,
  readHarnessFile,
  writeHarnessFile,
} from "../lib/tauri";
import {
  inferTransport,
  toClaudeFormat,
  toHarnessFormat,
} from "../lib/mcp-types";
import type { ClaudeMcpServer, McpTransport } from "../lib/mcp-types";

// ── Public types ──────────────────────────────────────────────────────────────

export type McpSource = "mcp.json" | "harness";

export interface McpServerEntry {
  name: string;
  config: ClaudeMcpServer;
  transport: McpTransport;
  /** True when this server name exists in both sources. */
  inBoth: boolean;
}

export interface UseMcpServersReturn {
  servers: McpServerEntry[];
  loading: boolean;
  error: string | null;
  saving: boolean;
  activeSource: McpSource;
  setActiveSource: (s: McpSource) => void;
  /** Resolved path of the active source file (null while loading or not found). */
  sourcePath: string | null;
  /** True when harness.yaml exists AND contains an mcp-servers section. */
  hasHarness: boolean;
  reload: () => void;
  addServer: (name: string, config: ClaudeMcpServer) => Promise<void>;
  updateServer: (name: string, config: ClaudeMcpServer) => Promise<void>;
  removeServer: (name: string) => Promise<void>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useMcpServers(): UseMcpServersReturn {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeSource, setActiveSource] = useState<McpSource>("mcp.json");

  // Raw loaded data — kept in refs so mutations can read the latest without
  // needing them as useCallback deps.
  const [mcpServers, setMcpServers] = useState<Record<string, ClaudeMcpServer>>({});
  const [harnessServers, setHarnessServers] = useState<Record<string, McpServer>>({});
  const [mcpSourcePath, setMcpSourcePath] = useState<string | null>(null);
  const [harnessPath, setHarnessPath] = useState<string | null>(null);
  const [hasHarnessMcp, setHasHarnessMcp] = useState(false);

  // Mutable refs for use inside async mutation callbacks (avoid stale closures).
  const mcpServersRef = useRef<Record<string, ClaudeMcpServer>>({});
  const harnessContentRef = useRef<string>("");

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [mcpResult, harnessResult] = await Promise.all([
        readMcpConfig(),
        readHarnessFile(),
      ]);

      // Parse mcp.json servers
      let parsedMcp: Record<string, ClaudeMcpServer> = {};
      if (mcpResult.found && mcpResult.serversJson) {
        try {
          parsedMcp = JSON.parse(mcpResult.serversJson) as Record<string, ClaudeMcpServer>;
        } catch {
          // Malformed JSON — fall back to empty
          parsedMcp = {};
        }
      }

      // Parse harness.yaml mcp-servers
      let parsedHarness: Record<string, McpServer> = {};
      let harnessRawContent = "";
      let harnessHasMcp = false;

      if (harnessResult.found && harnessResult.content) {
        harnessRawContent = harnessResult.content;
        try {
          const { config } = parseHarness(harnessRawContent);
          if (config["mcp-servers"] && Object.keys(config["mcp-servers"]).length > 0) {
            parsedHarness = config["mcp-servers"] as Record<string, McpServer>;
            harnessHasMcp = true;
          }
        } catch {
          // Unparseable harness — treat as empty
          parsedHarness = {};
        }
      }

      // Commit to state and refs
      mcpServersRef.current = parsedMcp;
      harnessContentRef.current = harnessRawContent;

      setMcpServers(parsedMcp);
      setHarnessServers(parsedHarness);
      setMcpSourcePath(mcpResult.source ?? null);
      setHarnessPath(harnessResult.path ?? null);
      setHasHarnessMcp(harnessHasMcp);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const reload = useCallback(() => { load(); }, [load]);

  // ── Derived entries (no network call on source switch) ──────────────────────

  const servers = useMemo<McpServerEntry[]>(() => {
    if (activeSource === "mcp.json") {
      return Object.entries(mcpServers)
        .map(([name, config]) => ({
          name,
          config,
          transport: inferTransport(config),
          inBoth: name in harnessServers,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } else {
      return Object.entries(harnessServers)
        .map(([name, harnessServer]) => {
          const config = toClaudeFormat(harnessServer);
          return {
            name,
            config,
            transport: inferTransport(config),
            inBoth: name in mcpServers,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  }, [activeSource, mcpServers, harnessServers]);

  // ── Source path for display ─────────────────────────────────────────────────

  const sourcePath = activeSource === "mcp.json" ? mcpSourcePath : harnessPath;

  // ── mcp.json mutations ──────────────────────────────────────────────────────

  async function writeMcp(updated: Record<string, ClaudeMcpServer>) {
    setSaving(true);
    try {
      await writeMcpConfig(JSON.stringify(updated));
      reload();
    } finally {
      setSaving(false);
    }
  }

  // ── harness.yaml mutations ──────────────────────────────────────────────────

  async function modifyHarness(
    fn: (servers: Record<string, McpServer>) => Record<string, McpServer>,
  ) {
    setSaving(true);
    try {
      const content = harnessContentRef.current;
      // Parse to plain JS object (lose comments, but simpler and predictable)
      const parsed = content ? (parseYaml(content) as Record<string, unknown>) ?? {} : {};
      const current = (parsed["mcp-servers"] ?? {}) as Record<string, McpServer>;
      const newServers = fn(current);

      if (Object.keys(newServers).length === 0) {
        delete parsed["mcp-servers"];
      } else {
        parsed["mcp-servers"] = newServers;
      }

      await writeHarnessFile(stringifyYaml(parsed));
      reload();
    } finally {
      setSaving(false);
    }
  }

  // ── Public mutation API ─────────────────────────────────────────────────────

  const addServer = useCallback(async (name: string, config: ClaudeMcpServer) => {
    if (activeSource === "mcp.json") {
      await writeMcp({ ...mcpServersRef.current, [name]: config });
    } else {
      await modifyHarness((servers) => ({
        ...servers,
        [name]: toHarnessFormat(config),
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSource]);

  const updateServer = useCallback(async (name: string, config: ClaudeMcpServer) => {
    if (activeSource === "mcp.json") {
      await writeMcp({ ...mcpServersRef.current, [name]: config });
    } else {
      await modifyHarness((servers) => ({
        ...servers,
        [name]: toHarnessFormat(config),
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSource]);

  const removeServer = useCallback(async (name: string) => {
    if (activeSource === "mcp.json") {
      const updated = { ...mcpServersRef.current };
      delete updated[name];
      await writeMcp(updated);
    } else {
      await modifyHarness((servers) => {
        const updated = { ...servers };
        delete updated[name];
        return updated;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSource]);

  // ── Return ──────────────────────────────────────────────────────────────────

  return {
    servers,
    loading,
    error,
    saving,
    activeSource,
    setActiveSource,
    sourcePath,
    hasHarness: hasHarnessMcp,
    reload,
    addServer,
    updateServer,
    removeServer,
  };
}
