import { invoke } from '@tauri-apps/api/core';
import type { ToolDef, ToolResult } from '../toolTypes';

export const harnessTools: ToolDef[] = [
  {
    name: 'harness.detect_agents',
    description: 'Detect which AI agent harnesses are installed (Claude Code, Cursor, Copilot, Codex, etc.)',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
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
];
