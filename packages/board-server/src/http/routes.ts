import { Router } from 'express';
import * as store from '../store/yaml-store.js';
import * as logStore from '../store/log-store.js';
import { taskRunner } from '../execution/runner.js';
import { listProfiles } from '../execution/profiles.js';
import type { TaskStatus, EpicStatus } from '../types.js';
import type { WsHub } from '../ws/hub.js';

export function createRouter(hub?: WsHub): Router {
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
      const { title, description, status, priority, category, complexity, agent_profile, use_worktree } = req.body as {
        title?: string;
        description?: string;
        status?: TaskStatus;
        priority?: import('../types.js').TaskPriority;
        category?: string;
        complexity?: string;
        agent_profile?: string;
        use_worktree?: boolean;
      };
      const updates: Partial<import('../types.js').Task> = {};
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (status !== undefined) updates.status = status;
      if (priority !== undefined) updates.priority = priority;
      if (category !== undefined) updates.category = category;
      if (complexity !== undefined) updates.complexity = complexity;
      if (agent_profile !== undefined) updates.agent_profile = agent_profile;
      if (use_worktree !== undefined) updates.use_worktree = use_worktree;
      const task = store.updateTask(req.params.slug, taskId, updates);
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

  router.post('/projects/:slug/tasks/:taskId/subtasks', async (req, res) => {
    try {
      const { slug, taskId } = req.params;
      const { title } = req.body as { title: string };
      if (!title) return res.status(400).json({ error: 'title is required' });
      const subtask = store.addSubtask(slug, Number(taskId), title);
      const project = store.readProject(slug);
      if (project) hub?.notifyProjectChanged(slug, project);
      res.json(subtask);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  router.patch('/projects/:slug/tasks/:taskId/subtasks/:subtaskId', async (req, res) => {
    try {
      const { slug, taskId, subtaskId } = req.params;
      const subtask = store.updateSubtask(slug, Number(taskId), Number(subtaskId), req.body as { status?: import('../types.js').Subtask['status']; title?: string });
      const project = store.readProject(slug);
      if (project) hub?.notifyProjectChanged(slug, project);
      res.json(subtask);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  router.delete('/projects/:slug/tasks/:taskId/subtasks/:subtaskId', async (req, res) => {
    try {
      const { slug, taskId, subtaskId } = req.params;
      store.removeSubtask(slug, Number(taskId), Number(subtaskId));
      const project = store.readProject(slug);
      if (project) hub?.notifyProjectChanged(slug, project);
      res.sendStatus(204);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  // --- Execution ---

  router.post('/projects/:slug/tasks/:taskId/execute', async (req, res) => {
    try {
      const { slug, taskId } = req.params;
      const { agent_profile, phase_config } = req.body as {
        agent_profile?: string;
        phase_config?: import('../types.js').PhaseConfig[];
      };
      const project = store.readProject(slug);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const allTasks = project.epics.flatMap(e => e.tasks);
      const task = allTasks.find(t => t.id === Number(taskId));
      if (!task) return res.status(404).json({ error: 'Task not found' });

      await taskRunner.start({
        slug,
        taskId: Number(taskId),
        description: task.description ?? task.title,
        worktreePath: task.worktree_path,
        phaseConfig: phase_config ?? task.phase_config,
        agentProfile: agent_profile ?? task.agent_profile,
        onLog: (line) => hub?.broadcastLogLine(slug, Number(taskId), line),
        onPhaseChange: (phase) => hub?.broadcastTaskEvent({
          type: 'task_phase_changed',
          slug,
          task_id: Number(taskId),
          phase,
        }),
      });

      const updated = store.readProject(slug);
      if (updated) hub?.notifyProjectChanged(slug, updated);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  router.post('/projects/:slug/tasks/:taskId/stop', async (req, res) => {
    try {
      const { slug, taskId } = req.params;
      await taskRunner.stop(slug, Number(taskId));
      const project = store.readProject(slug);
      if (project) hub?.notifyProjectChanged(slug, project);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  // --- Logs ---

  router.get('/projects/:slug/tasks/:taskId/logs', (req, res) => {
    try {
      const { slug, taskId } = req.params;
      const tail = Number(req.query.tail) || 100;
      const lines = logStore.readTail(slug, Number(taskId), tail);
      res.json({ lines });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // --- Agent Profiles ---

  router.get('/profiles', (_req, res) => {
    res.json(listProfiles());
  });

  return router;
}
