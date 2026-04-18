import { invoke } from '@tauri-apps/api/core';
import type { ToolDef, ToolResult } from '../toolTypes';

export const pluginTools: ToolDef[] = [
  {
    name: 'plugins.list_installed',
    description: 'List all installed Claude Code plugins',
    parameters: { type: 'object', properties: {}, required: [] },
    category: 'read',
    handler: async (): Promise<ToolResult> => {
      try {
        const data = await invoke('list_installed_plugins');
        return { ok: true, content: data };
      } catch (e) {
        return { ok: false, content: { error: String(e) } };
      }
    },
    describe: () => 'List installed plugins',
  },

  {
    name: 'plugins.uninstall',
    description: 'Uninstall a Claude Code plugin by name',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Plugin name to uninstall' },
      },
      required: ['name'],
    },
    category: 'write',
    handler: async (args: unknown): Promise<ToolResult> => {
      const { name } = args as { name: string };
      try {
        await invoke('uninstall_plugin', { name });
        return { ok: true, content: { message: `Plugin "${name}" uninstalled` } };
      } catch (e) {
        return { ok: false, content: { error: String(e) } };
      }
    },
    describe: (args) => `Uninstall plugin "${(args as { name?: string })?.name ?? '?'}"`,
  },
];
