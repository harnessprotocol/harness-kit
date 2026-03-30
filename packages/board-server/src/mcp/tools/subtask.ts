import { z } from 'zod';
import * as store from '../../store/yaml-store.js';

const projectAndTask = { project: z.string(), task_id: z.number() };

export const subtaskTools = [
  {
    name: 'add_subtask',
    description: 'Add a subtask/checklist item to a task',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project slug' },
        task_id: { type: 'number', description: 'Task ID' },
        title: { type: 'string', description: 'Subtask description' },
      },
      required: ['project', 'task_id', 'title'],
    },
    schema: z.object({
      ...projectAndTask,
      title: z.string().describe('Subtask description'),
    }),
    handler: async (args: { project: string; task_id: number; title: string }) => {
      const subtask = store.addSubtask(args.project, args.task_id, args.title);
      return { content: [{ type: 'text' as const, text: JSON.stringify(subtask) }] };
    },
  },
  {
    name: 'complete_subtask',
    description: 'Mark a subtask as completed',
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
      ...projectAndTask,
      subtask_id: z.number(),
    }),
    handler: async (args: { project: string; task_id: number; subtask_id: number }) => {
      await store.updateSubtask(args.project, args.task_id, args.subtask_id, { status: 'completed' });
      return { content: [{ type: 'text' as const, text: 'Subtask marked complete' }] };
    },
  },
  {
    name: 'fail_subtask',
    description: 'Mark a subtask as failed',
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
      ...projectAndTask,
      subtask_id: z.number(),
    }),
    handler: async (args: { project: string; task_id: number; subtask_id: number }) => {
      await store.updateSubtask(args.project, args.task_id, args.subtask_id, { status: 'failed' });
      return { content: [{ type: 'text' as const, text: 'Subtask marked failed' }] };
    },
  },
  {
    name: 'remove_subtask',
    description: 'Remove a subtask from a task',
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
      ...projectAndTask,
      subtask_id: z.number(),
    }),
    handler: async (args: { project: string; task_id: number; subtask_id: number }) => {
      store.removeSubtask(args.project, args.task_id, args.subtask_id);
      return { content: [{ type: 'text' as const, text: 'Subtask removed' }] };
    },
  },
] as const;
