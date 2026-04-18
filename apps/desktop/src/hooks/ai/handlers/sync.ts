import { invoke } from '@tauri-apps/api/core';
import type { ToolDef, ToolResult } from '../toolTypes';

export const syncTools: ToolDef[] = [
  {
    name: 'sync.read_file',
    description: 'Read the contents of a synced file (e.g. CLAUDE.md) by its relative path',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file' },
      },
      required: ['path'],
    },
    category: 'read',
    handler: async (args: unknown): Promise<ToolResult> => {
      const { path } = args as { path: string };
      try {
        const content = await invoke<string>('sync_read_file', { path });
        return { ok: true, content: { path, content } };
      } catch (e) {
        return { ok: false, content: { error: String(e) } };
      }
    },
    describe: (args) => `Read "${(args as { path?: string })?.path ?? '?'}"`,
  },

  {
    name: 'sync.write_files',
    description: 'Write one or more files to the sync directory. Provide an object mapping relative paths to file contents.',
    parameters: {
      type: 'object',
      properties: {
        files: {
          type: 'object',
          description: 'Map of relative path → file content strings',
        },
      },
      required: ['files'],
    },
    category: 'write',
    handler: async (args: unknown): Promise<ToolResult> => {
      const { files } = args as { files: Record<string, string> };
      try {
        await invoke('sync_write_files', { files });
        const count = Object.keys(files).length;
        return { ok: true, content: { message: `Wrote ${count} file${count !== 1 ? 's' : ''}` } };
      } catch (e) {
        return { ok: false, content: { error: String(e) } };
      }
    },
    describe: (args) => {
      const files = (args as { files?: Record<string, string> })?.files ?? {};
      const keys = Object.keys(files);
      if (keys.length === 1) return `Write "${keys[0]}"`;
      return `Write ${keys.length} files`;
    },
  },

  {
    name: 'sync.create_backup',
    description: 'Create a backup snapshot of the current sync directory state',
    parameters: { type: 'object', properties: {}, required: [] },
    category: 'write',
    handler: async (): Promise<ToolResult> => {
      try {
        const result = await invoke<string>('sync_create_backup');
        return { ok: true, content: { message: result } };
      } catch (e) {
        return { ok: false, content: { error: String(e) } };
      }
    },
    describe: () => 'Create sync backup',
  },
];
