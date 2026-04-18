import { invoke } from '@tauri-apps/api/core';
import type { ToolDef, ToolResult } from '../toolTypes';

export const mcpTools: ToolDef[] = [
  {
    name: 'mcp.list',
    description: 'List all configured MCP servers in ~/.claude/mcp.json',
    parameters: { type: 'object', properties: {}, required: [] },
    category: 'read',
    handler: async (): Promise<ToolResult> => {
      try {
        const content = await invoke<string>('read_mcp_config');
        try {
          return { ok: true, content: JSON.parse(content) };
        } catch {
          return { ok: true, content: { raw: content } };
        }
      } catch (e) {
        return { ok: false, content: { error: String(e) } };
      }
    },
    describe: () => 'List MCP servers',
  },

  {
    name: 'mcp.add',
    description: 'Add or update an MCP server entry in ~/.claude/mcp.json. Provide the server name and its configuration object.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Server name (key in the mcpServers object)' },
        config: {
          type: 'object',
          description: 'Server config (e.g. { command: "node", args: [...], env: {...} })',
        },
      },
      required: ['name', 'config'],
    },
    category: 'write',
    handler: async (args: unknown): Promise<ToolResult> => {
      const { name, config } = args as { name: string; config: unknown };
      try {
        const raw = await invoke<string>('read_mcp_config').catch(() => '{}');
        let parsed: { mcpServers?: Record<string, unknown> } = {};
        try { parsed = JSON.parse(raw); } catch { /* start fresh */ }
        parsed.mcpServers = { ...(parsed.mcpServers ?? {}), [name]: config };
        await invoke('write_mcp_config', { content: JSON.stringify(parsed, null, 2) });
        return { ok: true, content: { message: `MCP server "${name}" added/updated` } };
      } catch (e) {
        return { ok: false, content: { error: String(e) } };
      }
    },
    describe: (args) => `Add MCP server "${(args as { name?: string })?.name ?? '?'}"`,
  },

  {
    name: 'mcp.remove',
    description: 'Remove an MCP server from ~/.claude/mcp.json by name',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Server name to remove' },
      },
      required: ['name'],
    },
    category: 'write',
    handler: async (args: unknown): Promise<ToolResult> => {
      const { name } = args as { name: string };
      try {
        const raw = await invoke<string>('read_mcp_config').catch(() => '{}');
        let parsed: { mcpServers?: Record<string, unknown> } = {};
        try { parsed = JSON.parse(raw); } catch { /* start fresh */ }
        const { [name]: _removed, ...rest } = parsed.mcpServers ?? {};
        parsed.mcpServers = rest;
        await invoke('write_mcp_config', { content: JSON.stringify(parsed, null, 2) });
        return { ok: true, content: { message: `MCP server "${name}" removed` } };
      } catch (e) {
        return { ok: false, content: { error: String(e) } };
      }
    },
    describe: (args) => `Remove MCP server "${(args as { name?: string })?.name ?? '?'}"`,
  },
];
