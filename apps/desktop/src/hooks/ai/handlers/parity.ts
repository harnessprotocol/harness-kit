import { invoke } from '@tauri-apps/api/core';
import type { ToolDef, ToolResult } from '../toolTypes';

export const parityTools: ToolDef[] = [
  {
    name: 'parity.run_scan',
    description: 'Run a parity scan to compare harness configurations across detected AI agents',
    parameters: { type: 'object', properties: {}, required: [] },
    category: 'read',
    handler: async (): Promise<ToolResult> => {
      try {
        const data = await invoke('run_parity_scan');
        return { ok: true, content: data };
      } catch (e) {
        return { ok: false, content: { error: String(e) } };
      }
    },
    describe: () => 'Run parity scan',
  },
];
