import { invoke } from '@tauri-apps/api/core';
import type { ToolDef, ToolResult } from '../toolTypes';

export const observatoryTools: ToolDef[] = [
  {
    name: 'observatory.stats',
    description: 'Get live Claude usage statistics (tokens, cost, session counts, daily activity)',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    category: 'read',
    handler: async (): Promise<ToolResult> => {
      try {
        const data = await invoke('compute_live_stats');
        return { ok: true, content: data };
      } catch (e) {
        return { ok: false, content: { error: String(e) } };
      }
    },
    describe: () => 'Compute live Claude usage statistics',
  },

  {
    name: 'observatory.list_sessions',
    description: 'List recent Claude conversation sessions with summaries',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          description: 'Maximum number of sessions to return (default 20)',
        },
      },
      required: [],
    },
    category: 'read',
    handler: async (): Promise<ToolResult> => {
      try {
        const data = await invoke('list_sessions_summary');
        return { ok: true, content: data };
      } catch (e) {
        return { ok: false, content: { error: String(e) } };
      }
    },
    describe: () => 'List recent Claude sessions',
  },
];
