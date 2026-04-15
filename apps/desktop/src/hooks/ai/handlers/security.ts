import { invoke } from '@tauri-apps/api/core';
import type { ToolDef, ToolResult } from '../toolTypes';

export const securityTools: ToolDef[] = [
  {
    name: 'security.read_permissions',
    description: 'Read the current Claude security permission settings (allowed tools, blocked commands, etc.)',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    category: 'read',
    handler: async (): Promise<ToolResult> => {
      try {
        const data = await invoke('read_permissions');
        return { ok: true, content: data };
      } catch (e) {
        return { ok: false, content: { error: String(e) } };
      }
    },
    describe: () => 'Read security permissions',
  },

  {
    name: 'security.list_audit',
    description: 'List recent security audit log entries',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          description: 'Maximum number of entries to return (default 50)',
        },
      },
      required: [],
    },
    category: 'read',
    handler: async (args: unknown): Promise<ToolResult> => {
      try {
        const { limit = 50 } = (args as { limit?: number }) ?? {};
        const data = await invoke('list_audit_entries', { limit });
        return { ok: true, content: data };
      } catch (e) {
        return { ok: false, content: { error: String(e) } };
      }
    },
    describe: (args) => `List audit entries (limit: ${(args as { limit?: number })?.limit ?? 50})`,
  },

  {
    name: 'security.apply_preset',
    description: 'Apply a named security preset to Claude permissions',
    parameters: {
      type: 'object',
      properties: {
        preset_id: {
          type: 'string',
          description: 'The ID of the security preset to apply',
        },
      },
      required: ['preset_id'],
    },
    category: 'write',
    handler: async (args: unknown): Promise<ToolResult> => {
      try {
        const { preset_id } = args as { preset_id: string };
        await invoke('apply_security_preset', { presetId: preset_id });
        return { ok: true, content: { applied: preset_id } };
      } catch (e) {
        return { ok: false, content: { error: String(e) } };
      }
    },
    describe: (args) =>
      `Apply security preset "${(args as { preset_id?: string })?.preset_id ?? '?'}"`,
  },
];
