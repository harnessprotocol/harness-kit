/**
 * Memory tool handlers — talk to the membrain server at localhost:3131.
 * All requests use fetch() since membrain is an external HTTP service.
 */
import type { ToolDef, ToolResult } from '../toolTypes';

const MEMBRAIN_BASE = 'http://localhost:3131';

async function membrainFetch(path: string, init?: RequestInit): Promise<ToolResult> {
  try {
    const res = await fetch(`${MEMBRAIN_BASE}${path}`, init);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, content: { error: `membrain ${res.status}: ${body}` } };
    }
    const data = await res.json();
    return { ok: true, content: data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('ECONNREFUSED') || msg.includes('Failed to fetch')) {
      return { ok: false, content: { error: 'memory server not running — start it from the Memory tab' } };
    }
    return { ok: false, content: { error: msg } };
  }
}

export const memoryTools: ToolDef[] = [
  {
    name: 'memory.search',
    description: 'Search the memory graph for entities or observations matching a query',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'integer', description: 'Max results (default 10)' },
      },
      required: ['query'],
    },
    category: 'read',
    handler: async (args: unknown): Promise<ToolResult> => {
      const { query, limit = 10 } = args as { query: string; limit?: number };
      return membrainFetch(`/api/v1/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    },
    describe: (args) => `Search memory: "${(args as { query?: string })?.query ?? '?'}"`,
  },

  {
    name: 'memory.get_graph_stats',
    description: 'Get statistics about the memory knowledge graph (entity count, relation count, etc.)',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    category: 'read',
    handler: async (): Promise<ToolResult> => {
      return membrainFetch('/api/v1/graph/stats');
    },
    describe: () => 'Get memory graph statistics',
  },

  {
    name: 'memory.add_observation',
    description: 'Add a new observation or fact to an entity in the memory graph',
    parameters: {
      type: 'object',
      properties: {
        entity: { type: 'string', description: 'Entity name or ID' },
        observation: { type: 'string', description: 'The observation or fact to record' },
        source: { type: 'string', description: 'Source of the observation (e.g. "ai-chat")' },
      },
      required: ['entity', 'observation'],
    },
    category: 'write',
    handler: async (args: unknown): Promise<ToolResult> => {
      const { entity, observation, source = 'ai-chat' } = args as {
        entity: string;
        observation: string;
        source?: string;
      };
      return membrainFetch('/api/v1/observations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity, observation, source }),
      });
    },
    describe: (args) => {
      const { entity, observation } = (args as { entity?: string; observation?: string }) ?? {};
      return `Add observation to "${entity ?? '?'}": "${observation ?? '?'}"`;
    },
  },
];
