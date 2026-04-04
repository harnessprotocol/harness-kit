import { z } from 'zod';
import * as store from '../../store/yaml-store.js';
import { readBoardLink, resolveWorktreePath } from '../../store/link-resolver.js';
import { taskBranchName, taskWorktreeName } from '../../git/branch.js';
import { createWorktree, isGitRepo } from '../../git/worktree.js';
import type { TaskStatus } from '../../types.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const taskStatusSchema = z.enum(['backlog', 'planning', 'in-progress', 'ai-review', 'human-review', 'done']);

export const taskTools = [
  {
    name: 'create_task',
    description: 'Create a new task under an epic',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project slug' },
        epic_id: { type: 'number', description: 'Epic ID' },
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Optional task description' },
      },
      required: ['project', 'epic_id', 'title'],
    },
    schema: z.object({
      project: z.string(),
      epic_id: z.number(),
      title: z.string(),
      description: z.string().optional(),
    }),
    handler: async (args: { project: string; epic_id: number; title: string; description?: string }) => {
      const task = store.createTask(args.project, args.epic_id, args.title, args.description);
      return { content: [{ type: 'text' as const, text: JSON.stringify(task, null, 2) }] };
    },
  },
  {
    name: 'update_task',
    description: 'Update task fields: title, description, category, complexity, or no_worktree flag',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project slug' },
        task_id: { type: 'number', description: 'Task ID' },
        title: { type: 'string', description: 'New title' },
        description: { type: 'string', description: 'New description' },
        category: { type: 'string', enum: ['feature', 'bug_fix', 'refactoring', 'docs', 'security', 'performance', 'ui_ux', 'infrastructure', 'testing'], description: 'Task category' },
        complexity: { type: 'string', enum: ['trivial', 'small', 'medium', 'large', 'complex'], description: 'Task complexity' },
        no_worktree: { type: 'boolean', description: 'Disable auto-worktree for this task' },
      },
      required: ['project', 'task_id'],
    },
    schema: z.object({
      project: z.string(),
      task_id: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
      category: z.enum(['feature', 'bug_fix', 'refactoring', 'docs', 'security', 'performance', 'ui_ux', 'infrastructure', 'testing']).optional(),
      complexity: z.enum(['trivial', 'small', 'medium', 'large', 'complex']).optional(),
      no_worktree: z.boolean().optional(),
    }),
    handler: async (args: { project: string; task_id: number; title?: string; description?: string; category?: string; complexity?: string; no_worktree?: boolean }) => {
      const task = store.updateTask(args.project, args.task_id, {
        title: args.title,
        description: args.description,
        category: args.category as import('../../types.js').TaskCategory,
        complexity: args.complexity as import('../../types.js').TaskComplexity,
        no_worktree: args.no_worktree,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(task, null, 2) }] };
    },
  },
  {
    name: 'move_task',
    description: 'Change a task status column (backlog → planning → in-progress → ai-review → human-review → done)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project slug' },
        task_id: { type: 'number', description: 'Task ID' },
        status: { type: 'string', enum: ['backlog', 'planning', 'in-progress', 'ai-review', 'human-review', 'done'], description: 'New status' },
      },
      required: ['project', 'task_id', 'status'],
    },
    schema: z.object({
      project: z.string(),
      task_id: z.number(),
      status: taskStatusSchema,
    }),
    handler: async (args: { project: string; task_id: number; status: TaskStatus }) => {
      const task = store.moveTask(args.project, args.task_id, args.status);
      const notes: string[] = [];

      // --- Worktree auto-creation on in-progress ---
      if (args.status === 'in-progress' && !task.branch && !task.no_worktree) {
        const worktreeResult = tryCreateWorktree(args.project, task.id, task.title);
        if (worktreeResult.created) {
          store.linkBranch(args.project, task.id, worktreeResult.branch!, worktreeResult.worktreePath!);
          notes.push(`Worktree created: ${worktreeResult.worktreePath}`);
          notes.push(`Branch: ${worktreeResult.branch}`);
        } else if (worktreeResult.reason) {
          notes.push(`Note: ${worktreeResult.reason}`);
        }
      }

      // --- Cleanup prompt on done ---
      if (args.status === 'done' && task.worktree_path) {
        const cleanupNote = `Task is done. Worktree at ${task.worktree_path} can be removed when ready.\n` +
          `Run: git worktree remove "${task.worktree_path}"`;
        store.addComment(args.project, task.id, 'claude', cleanupNote);
        notes.push('Cleanup prompt added as comment.');
      }

      const refreshed = store.findTask(
        store.readProject(args.project)!,
        task.id,
      );

      const text = [
        JSON.stringify(refreshed?.task ?? task, null, 2),
        ...(notes.length ? ['', '---', ...notes] : []),
      ].join('\n');

      return { content: [{ type: 'text' as const, text }] };
    },
  },
  {
    name: 'add_comment',
    description: 'Post a comment on a task (author: "claude" or "user")',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project slug' },
        task_id: { type: 'number', description: 'Task ID' },
        author: { type: 'string', enum: ['claude', 'user'], description: 'Comment author' },
        body: { type: 'string', description: 'Comment body (markdown supported)' },
      },
      required: ['project', 'task_id', 'author', 'body'],
    },
    schema: z.object({
      project: z.string(),
      task_id: z.number(),
      author: z.enum(['claude', 'user']),
      body: z.string(),
    }),
    handler: async (args: { project: string; task_id: number; author: 'claude' | 'user'; body: string }) => {
      const comment = store.addComment(args.project, args.task_id, args.author, args.body);
      return { content: [{ type: 'text' as const, text: JSON.stringify(comment, null, 2) }] };
    },
  },
  {
    name: 'list_tasks',
    description: 'List tasks, optionally filtered by project, epic, or status',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Filter by project slug' },
        epic_id: { type: 'number', description: 'Filter by epic ID' },
        status: { type: 'string', enum: ['backlog', 'planning', 'in-progress', 'ai-review', 'human-review', 'done'], description: 'Filter by status' },
      },
    },
    schema: z.object({
      project: z.string().optional(),
      epic_id: z.number().optional(),
      status: taskStatusSchema.optional(),
    }),
    handler: async (args: { project?: string; epic_id?: number; status?: TaskStatus }) => {
      const tasks = store.listTasks({ project: args.project, epicId: args.epic_id, status: args.status });
      return { content: [{ type: 'text' as const, text: JSON.stringify(tasks, null, 2) }] };
    },
  },
  {
    name: 'link_branch',
    description: 'Associate a git branch and optional worktree path with a task',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project slug' },
        task_id: { type: 'number', description: 'Task ID' },
        branch: { type: 'string', description: 'Branch name (e.g. board/task-3-fix-auth)' },
        worktree_path: { type: 'string', description: 'Absolute path to worktree (optional)' },
      },
      required: ['project', 'task_id', 'branch'],
    },
    schema: z.object({
      project: z.string(),
      task_id: z.number(),
      branch: z.string(),
      worktree_path: z.string().optional(),
    }),
    handler: async (args: { project: string; task_id: number; branch: string; worktree_path?: string }) => {
      const task = store.linkBranch(args.project, args.task_id, args.branch, args.worktree_path);
      return { content: [{ type: 'text' as const, text: JSON.stringify(task, null, 2) }] };
    },
  },
  {
    name: 'link_commit',
    description: 'Attach a commit SHA to a task',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project slug' },
        task_id: { type: 'number', description: 'Task ID' },
        sha: { type: 'string', description: 'Commit SHA' },
      },
      required: ['project', 'task_id', 'sha'],
    },
    schema: z.object({
      project: z.string(),
      task_id: z.number(),
      sha: z.string(),
    }),
    handler: async (args: { project: string; task_id: number; sha: string }) => {
      const task = store.linkCommit(args.project, args.task_id, args.sha);
      return { content: [{ type: 'text' as const, text: JSON.stringify(task, null, 2) }] };
    },
  },
  {
    name: 'request_review',
    description: 'Flag a task as ready for AI review (moves to "ai-review" status)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project slug' },
        task_id: { type: 'number', description: 'Task ID' },
        note: { type: 'string', description: 'Optional review note (posted as a claude comment)' },
      },
      required: ['project', 'task_id'],
    },
    schema: z.object({
      project: z.string(),
      task_id: z.number(),
      note: z.string().optional(),
    }),
    handler: async (args: { project: string; task_id: number; note?: string }) => {
      const task = store.moveTask(args.project, args.task_id, 'ai-review');
      if (args.note) {
        store.addComment(args.project, args.task_id, 'claude', `**Ready for review:** ${args.note}`);
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(task, null, 2) }] };
    },
  },
  {
    name: 'block_task',
    description: 'Mark a task as blocked with a reason',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project slug' },
        task_id: { type: 'number', description: 'Task ID' },
        reason: { type: 'string', description: 'Why this task is blocked' },
      },
      required: ['project', 'task_id', 'reason'],
    },
    schema: z.object({
      project: z.string(),
      task_id: z.number(),
      reason: z.string(),
    }),
    handler: async (args: { project: string; task_id: number; reason: string }) => {
      const task = store.blockTask(args.project, args.task_id, args.reason);
      return { content: [{ type: 'text' as const, text: JSON.stringify(task, null, 2) }] };
    },
  },
  {
    name: 'unblock_task',
    description: 'Clear the blocked status on a task',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project slug' },
        task_id: { type: 'number', description: 'Task ID' },
      },
      required: ['project', 'task_id'],
    },
    schema: z.object({
      project: z.string(),
      task_id: z.number(),
    }),
    handler: async (args: { project: string; task_id: number }) => {
      const task = store.unblockTask(args.project, args.task_id);
      return { content: [{ type: 'text' as const, text: JSON.stringify(task, null, 2) }] };
    },
  },
  // --- Subtask tools ---
  {
    name: 'add_subtask',
    description: 'Add a subtask to a task. Subtasks track implementation steps with their own status and associated files.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project slug' },
        task_id: { type: 'number', description: 'Task ID' },
        title: { type: 'string', description: 'Subtask title (3-10 words)' },
        description: { type: 'string', description: 'Detailed implementation notes' },
      },
      required: ['project', 'task_id', 'title'],
    },
    schema: z.object({
      project: z.string(),
      task_id: z.number(),
      title: z.string(),
      description: z.string().optional(),
    }),
    handler: async (args: { project: string; task_id: number; title: string; description?: string }) => {
      const subtask = store.addSubtask(args.project, args.task_id, args.title, args.description);
      const project = store.readProject(args.project);
      const found = project ? store.findTask(project, args.task_id) : undefined;
      const task = found?.task;
      const completed = task?.subtasks.filter(s => s.status === 'completed').length ?? 0;
      const total = task?.subtasks.length ?? 0;
      const text = [
        JSON.stringify(subtask, null, 2),
        '',
        `Progress: ${completed}/${total} subtasks complete (${total > 0 ? Math.round(completed / total * 100) : 0}%)`,
      ].join('\n');
      return { content: [{ type: 'text' as const, text }] };
    },
  },
  {
    name: 'update_subtask',
    description: 'Update a subtask title, description, or status (pending → in_progress → completed/failed)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project slug' },
        task_id: { type: 'number', description: 'Task ID' },
        subtask_id: { type: 'number', description: 'Subtask ID' },
        title: { type: 'string', description: 'New subtask title' },
        description: { type: 'string', description: 'New subtask description' },
        status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'failed'], description: 'New subtask status' },
      },
      required: ['project', 'task_id', 'subtask_id'],
    },
    schema: z.object({
      project: z.string(),
      task_id: z.number(),
      subtask_id: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
      status: z.enum(['pending', 'in_progress', 'completed', 'failed']).optional(),
    }),
    handler: async (args: { project: string; task_id: number; subtask_id: number; title?: string; description?: string; status?: string }) => {
      const subtask = store.updateSubtask(args.project, args.task_id, args.subtask_id, {
        title: args.title,
        description: args.description,
        status: args.status as import('../../types.js').SubtaskStatus,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(subtask, null, 2) }] };
    },
  },
  {
    name: 'remove_subtask',
    description: 'Delete a subtask from a task',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project slug' },
        task_id: { type: 'number', description: 'Task ID' },
        subtask_id: { type: 'number', description: 'Subtask ID' },
      },
      required: ['project', 'task_id', 'subtask_id'],
    },
    schema: z.object({
      project: z.string(),
      task_id: z.number(),
      subtask_id: z.number(),
    }),
    handler: async (args: { project: string; task_id: number; subtask_id: number }) => {
      store.removeSubtask(args.project, args.task_id, args.subtask_id);
      return { content: [{ type: 'text' as const, text: `Subtask ${args.subtask_id} removed from task ${args.task_id}` }] };
    },
  },
  {
    name: 'add_subtask_file',
    description: 'Associate a file path with a subtask (tracks which files a subtask modifies)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project slug' },
        task_id: { type: 'number', description: 'Task ID' },
        subtask_id: { type: 'number', description: 'Subtask ID' },
        file_path: { type: 'string', description: 'Relative file path' },
      },
      required: ['project', 'task_id', 'subtask_id', 'file_path'],
    },
    schema: z.object({
      project: z.string(),
      task_id: z.number(),
      subtask_id: z.number(),
      file_path: z.string(),
    }),
    handler: async (args: { project: string; task_id: number; subtask_id: number; file_path: string }) => {
      const subtask = store.addSubtaskFile(args.project, args.task_id, args.subtask_id, args.file_path);
      return { content: [{ type: 'text' as const, text: JSON.stringify(subtask, null, 2) }] };
    },
  },
] as const;

// ---------------------------------------------------------------------------
// Worktree helper — best-effort, never throws
// ---------------------------------------------------------------------------

type WorktreeResult =
  | { created: true; branch: string; worktreePath: string; reason?: undefined }
  | { created: false; branch?: undefined; worktreePath?: undefined; reason: string };

/**
 * Try to find the repo linked to this project and create a worktree for the task.
 * Searches the current working directory and common repo roots.
 */
function tryCreateWorktree(projectSlug: string, taskId: number, taskTitle: string): WorktreeResult {
  // Candidate repo roots to search for a .board.yaml link
  const candidates = [
    process.cwd(),
    path.join(os.homedir(), 'repos'),
    path.join(os.homedir(), 'projects'),
    path.join(os.homedir(), 'code'),
  ];

  // Also check direct children of candidate dirs
  const expandedCandidates: string[] = [];
  for (const c of candidates) {
    expandedCandidates.push(c);
    try {
      const entries = fs.readdirSync(c, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) expandedCandidates.push(path.join(c, e.name));
      }
    } catch { /* ignore unreadable dirs */ }
  }

  let repoPath: string | null = null;
  for (const candidate of expandedCandidates) {
    const link = readBoardLink(candidate);
    if (link?.project === projectSlug && isGitRepo(candidate)) {
      repoPath = candidate;
      break;
    }
  }

  if (!repoPath) {
    return {
      created: false,
      reason: 'No .board.yaml found linking this project to a repo. Add one with: echo "project: ' + projectSlug + '" > .board.yaml',
    };
  }

  try {
    const branchName = taskBranchName(taskId, taskTitle);
    const worktreeDirName = taskWorktreeName(taskId);
    const worktreePath = resolveWorktreePath(repoPath, worktreeDirName);
    const absPath = createWorktree(repoPath, branchName, worktreePath);
    return { created: true, branch: branchName, worktreePath: absPath };
  } catch (err) {
    return { created: false, reason: `Worktree creation failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
