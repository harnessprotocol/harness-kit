import { invoke } from '@tauri-apps/api/core';
import type { ToolDef, ToolResult } from '../toolTypes';

export const gitTools: ToolDef[] = [
  {
    name: 'git.diff',
    description: 'Get the git diff of a worktree against a specific commit',
    parameters: {
      type: 'object',
      properties: {
        worktree_path: { type: 'string', description: 'Absolute path to the worktree' },
        commit: { type: 'string', description: 'Commit SHA to diff against (defaults to HEAD)' },
      },
      required: ['worktree_path'],
    },
    category: 'read',
    handler: async (args: unknown): Promise<ToolResult> => {
      const { worktree_path, commit = 'HEAD' } = args as {
        worktree_path: string;
        commit?: string;
      };
      try {
        const diff = await invoke<string>('get_diff_against_commit', {
          worktreePath: worktree_path,
          commit,
        });
        return { ok: true, content: { diff } };
      } catch (e) {
        return { ok: false, content: { error: String(e) } };
      }
    },
    describe: (args) =>
      `Diff "${(args as { worktree_path?: string })?.worktree_path ?? '?'}" against HEAD`,
  },

  {
    name: 'git.create_worktree',
    description: 'Create a new git worktree for a board task',
    parameters: {
      type: 'object',
      properties: {
        project_slug: { type: 'string', description: 'Board project slug' },
        task_id: { type: 'string', description: 'Task ID to create the worktree for' },
      },
      required: ['project_slug', 'task_id'],
    },
    category: 'write',
    handler: async (args: unknown): Promise<ToolResult> => {
      const { project_slug, task_id } = args as { project_slug: string; task_id: string };
      try {
        const result = await invoke('create_worktrees', {
          projectSlug: project_slug,
          taskId: task_id,
        });
        return { ok: true, content: result };
      } catch (e) {
        return { ok: false, content: { error: String(e) } };
      }
    },
    describe: (args) => {
      const { project_slug, task_id } = (args as { project_slug?: string; task_id?: string }) ?? {};
      return `Create worktree for task ${task_id ?? '?'} in ${project_slug ?? '?'}`;
    },
  },

  {
    name: 'git.remove_worktree',
    description: 'Remove an existing git worktree',
    parameters: {
      type: 'object',
      properties: {
        project_slug: { type: 'string', description: 'Board project slug' },
        task_id: { type: 'string', description: 'Task ID whose worktree to remove' },
      },
      required: ['project_slug', 'task_id'],
    },
    category: 'write',
    handler: async (args: unknown): Promise<ToolResult> => {
      const { project_slug, task_id } = args as { project_slug: string; task_id: string };
      try {
        await invoke('remove_worktrees', {
          projectSlug: project_slug,
          taskId: task_id,
        });
        return { ok: true, content: { message: `Worktree removed for task ${task_id}` } };
      } catch (e) {
        return { ok: false, content: { error: String(e) } };
      }
    },
    describe: (args) =>
      `Remove worktree for task ${(args as { task_id?: string })?.task_id ?? '?'}`,
  },
];
