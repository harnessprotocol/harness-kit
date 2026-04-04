import { Router } from 'express';
import * as store from '../store/yaml-store.js';
import type { TaskStatus, TaskPriority, TaskCategory, TaskComplexity, SubtaskStatus, EpicStatus, ExecutionStatus } from '../types.js';

export function createRouter(): Router {
  const router = Router();

  // --- Projects ---

  router.get('/projects', (_req, res) => {
    try {
      res.json(store.listProjects());
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post('/projects', (req, res) => {
    try {
      const { name, description, color, repo_url } = req.body as {
        name: string;
        description?: string;
        color?: string;
        repo_url?: string;
      };
      if (!name) return res.status(400).json({ error: 'name is required' });
      const project = store.createProject({ name, description, color, repo_url });
      res.status(201).json(project);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  router.patch('/projects/:slug', (req, res) => {
    try {
      const { description, color, repo_url } = req.body as {
        description?: string;
        color?: string;
        repo_url?: string;
      };
      const project = store.updateProject(req.params.slug, { description, color, repo_url });
      res.json(project);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  router.patch('/projects/:slug/settings', (req, res) => {
    try {
      const { default_harness, default_model, max_concurrent } = req.body as {
        default_harness?: string;
        default_model?: string;
        max_concurrent?: number;
      };
      const project = store.updateProjectSettings(req.params.slug, { default_harness, default_model, max_concurrent });
      res.json(project);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  router.get('/projects/:slug', (req, res) => {
    try {
      const project = store.readProject(req.params.slug);
      if (!project) return res.status(404).json({ error: 'Not found' });
      res.json(project);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // --- Epics ---

  router.post('/projects/:slug/epics', (req, res) => {
    try {
      const { name, description } = req.body as { name: string; description?: string };
      if (!name) return res.status(400).json({ error: 'name is required' });
      const epic = store.createEpic(req.params.slug, name, description);
      res.status(201).json(epic);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  router.patch('/projects/:slug/epics/:epicId', (req, res) => {
    try {
      const epicId = Number(req.params.epicId);
      const { status } = req.body as { status: EpicStatus };
      const epic = store.updateEpicStatus(req.params.slug, epicId, status);
      res.json(epic);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  // --- Tasks ---

  router.get('/projects/:slug/tasks', (req, res) => {
    try {
      const epicId = req.query.epic_id ? Number(req.query.epic_id) : undefined;
      const status = req.query.status as TaskStatus | undefined;
      const tasks = store.listTasks({ project: req.params.slug, epicId, status });
      res.json(tasks);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post('/projects/:slug/epics/:epicId/tasks', (req, res) => {
    try {
      const epicId = Number(req.params.epicId);
      const { title, description } = req.body as { title: string; description?: string };
      if (!title) return res.status(400).json({ error: 'title is required' });
      const task = store.createTask(req.params.slug, epicId, title, description);
      res.status(201).json(task);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  router.patch('/projects/:slug/tasks/:taskId', (req, res) => {
    try {
      const taskId = Number(req.params.taskId);
      const { title, description, status, priority, category, complexity, no_worktree, default_harness, default_model } = req.body as {
        title?: string;
        description?: string;
        status?: TaskStatus;
        priority?: TaskPriority;
        category?: TaskCategory;
        complexity?: TaskComplexity;
        no_worktree?: boolean;
        default_harness?: string;
        default_model?: string;
      };
      const updates: Partial<Pick<import('../types.js').Task, 'title' | 'description' | 'status' | 'priority' | 'category' | 'complexity' | 'no_worktree' | 'default_harness' | 'default_model'>> = {};
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (status !== undefined) updates.status = status;
      if (priority !== undefined) updates.priority = priority;
      if (category !== undefined) updates.category = category;
      if (complexity !== undefined) updates.complexity = complexity;
      if (no_worktree !== undefined) updates.no_worktree = no_worktree;
      if (default_harness !== undefined) updates.default_harness = default_harness;
      if (default_model !== undefined) updates.default_model = default_model;
      const task = store.updateTask(req.params.slug, taskId, updates);
      res.json(task);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  router.patch('/projects/:slug/tasks/:taskId/execution', (req, res) => {
    try {
      const taskId = Number(req.params.taskId);
      const { status, harness_id, model, started_at, finished_at, exit_code } = req.body as {
        status?: ExecutionStatus;
        harness_id?: string;
        model?: string;
        started_at?: string;
        finished_at?: string;
        exit_code?: number;
      };
      const task = store.updateTaskExecution(req.params.slug, taskId, { status, harness_id, model, started_at, finished_at, exit_code });
      res.json(task);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  // --- Comments ---

  router.post('/projects/:slug/tasks/:taskId/comments', (req, res) => {
    try {
      const taskId = Number(req.params.taskId);
      const { author, body } = req.body as { author: 'claude' | 'user'; body: string };
      if (!author || !body) return res.status(400).json({ error: 'author and body are required' });
      const comment = store.addComment(req.params.slug, taskId, author, body);
      res.status(201).json(comment);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  // --- Subtasks ---

  router.post('/projects/:slug/tasks/:taskId/subtasks', (req, res) => {
    try {
      const taskId = Number(req.params.taskId);
      const { title, description } = req.body as { title: string; description?: string };
      if (!title) return res.status(400).json({ error: 'title is required' });
      const subtask = store.addSubtask(req.params.slug, taskId, title, description);
      res.status(201).json(subtask);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  router.patch('/projects/:slug/tasks/:taskId/subtasks/:subtaskId', (req, res) => {
    try {
      const taskId = Number(req.params.taskId);
      const subtaskId = Number(req.params.subtaskId);
      const { title, description, status } = req.body as {
        title?: string;
        description?: string;
        status?: SubtaskStatus;
      };
      const subtask = store.updateSubtask(req.params.slug, taskId, subtaskId, { title, description, status });
      res.json(subtask);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  router.delete('/projects/:slug/tasks/:taskId/subtasks/:subtaskId', (req, res) => {
    try {
      const taskId = Number(req.params.taskId);
      const subtaskId = Number(req.params.subtaskId);
      store.removeSubtask(req.params.slug, taskId, subtaskId);
      res.status(204).send();
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  return router;
}
