/**
 * Board tool handlers — talk to the board-server at localhost:4800.
 * All requests use fetch() since board-server is an external HTTP service.
 */
import type { ToolDef, ToolResult } from '../toolTypes';

const BOARD_BASE = 'http://localhost:4800';

async function boardFetch(path: string, init?: RequestInit): Promise<ToolResult> {
  try {
    const res = await fetch(`${BOARD_BASE}${path}`, init);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, content: { error: `board-server ${res.status}: ${body}` } };
    }
    const data = await res.json();
    return { ok: true, content: data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('ECONNREFUSED') || msg.includes('Failed to fetch')) {
      return { ok: false, content: { error: 'board server not running — install with: pnpm board:install' } };
    }
    return { ok: false, content: { error: msg } };
  }
}

export const boardTools: ToolDef[] = [
  {
    name: 'board.list_projects',
    description: 'List all projects on the Kanban board',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    category: 'read',
    handler: async (): Promise<ToolResult> => {
      return boardFetch('/api/projects');
    },
    describe: () => 'List board projects',
  },

  {
    name: 'board.list_tasks',
    description: 'List tasks for a specific board project, optionally filtered by status or epic',
    parameters: {
      type: 'object',
      properties: {
        project_slug: { type: 'string', description: 'Project slug identifier' },
        status: { type: 'string', description: 'Filter by status (e.g. "in-progress", "done")' },
        epic_id: { type: 'string', description: 'Filter by epic ID' },
      },
      required: ['project_slug'],
    },
    category: 'read',
    handler: async (args: unknown): Promise<ToolResult> => {
      const { project_slug, status, epic_id } = args as {
        project_slug: string;
        status?: string;
        epic_id?: string;
      };
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (epic_id) params.set('epicId', epic_id);
      const qs = params.toString() ? `?${params.toString()}` : '';
      return boardFetch(`/api/projects/${encodeURIComponent(project_slug)}/tasks${qs}`);
    },
    describe: (args) =>
      `List tasks in "${(args as { project_slug?: string })?.project_slug ?? '?'}"`,
  },

  {
    name: 'board.create_task',
    description: 'Create a new task on the Kanban board under a given project and epic',
    parameters: {
      type: 'object',
      properties: {
        project_slug: { type: 'string', description: 'Project slug identifier' },
        epic_id: { type: 'string', description: 'Epic ID to add the task to' },
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Task description (optional)' },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'Task priority',
        },
      },
      required: ['project_slug', 'title'],
    },
    category: 'write',
    handler: async (args: unknown): Promise<ToolResult> => {
      const { project_slug, epic_id, title, description, priority = 'medium' } = args as {
        project_slug: string;
        epic_id?: string;
        title: string;
        description?: string;
        priority?: string;
      };
      return boardFetch(`/api/projects/${encodeURIComponent(project_slug)}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epic_id, title, description, priority }),
      });
    },
    describe: (args) => {
      const { project_slug, title } = (args as { project_slug?: string; title?: string }) ?? {};
      return `Create task "${title ?? '?'}" in project "${project_slug ?? '?'}"`;
    },
  },
];
