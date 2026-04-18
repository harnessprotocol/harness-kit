import { invoke } from '@tauri-apps/api/core';
import type { ToolDef, ToolResult } from '../toolTypes';

export const harnessTools: ToolDef[] = [
  {
    name: 'harness.detect_agents',
    description: 'Detect which AI agent harnesses are installed (Claude Code, Cursor, Copilot, Codex, etc.)',
    parameters: { type: 'object', properties: {}, required: [] },
    category: 'read',
    handler: async (): Promise<ToolResult> => {
      try {
        const data = await invoke('detect_agents');
        return { ok: true, content: data };
      } catch (e) {
        return { ok: false, content: { error: String(e) } };
      }
    },
    describe: () => 'Detect installed AI agent harnesses',
  },

  {
    name: 'harness.read_config',
    description: 'Read the current harness.yaml configuration file',
    parameters: { type: 'object', properties: {}, required: [] },
    category: 'read',
    handler: async (): Promise<ToolResult> => {
      try {
        const content = await invoke<string>('read_harness_file');
        return { ok: true, content: { yaml: content } };
      } catch (e) {
        return { ok: false, content: { error: String(e) } };
      }
    },
    describe: () => 'Read harness.yaml',
  },

  {
    name: 'harness.write_config',
    description: 'Write new content to the harness.yaml configuration file. Provide the full YAML content.',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Full YAML content to write' },
      },
      required: ['content'],
    },
    category: 'write',
    handler: async (args: unknown): Promise<ToolResult> => {
      const { content } = args as { content: string };
      try {
        await invoke('write_harness_file', { content });
        return { ok: true, content: { message: 'harness.yaml updated' } };
      } catch (e) {
        return { ok: false, content: { error: String(e) } };
      }
    },
    describe: (args) => {
      const lines = ((args as { content?: string })?.content ?? '').split('\n').length;
      return `Write harness.yaml (${lines} lines)`;
    },
  },

  {
    name: 'harness.list_profiles',
    description: 'List all available harness profiles',
    parameters: { type: 'object', properties: {}, required: [] },
    category: 'read',
    handler: async (): Promise<ToolResult> => {
      try {
        const data = await invoke('list_custom_profiles');
        return { ok: true, content: data };
      } catch (e) {
        return { ok: false, content: { error: String(e) } };
      }
    },
    describe: () => 'List harness profiles',
  },
];
