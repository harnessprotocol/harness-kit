import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import yaml from 'js-yaml';
import type { Project, Epic, Task, Subtask, Comment, TaskStatus, SubtaskStatus, TaskCategory, TaskComplexity, EpicStatus, TaskExecution } from '../types.js';

function getBoardDir(): string {
  if (process.env.NODE_ENV === 'test' && process.env.BOARD_TEST_DIR) {
    return process.env.BOARD_TEST_DIR;
  }
  return path.join(os.homedir(), '.harness', 'board', 'projects');
}

let boardDirEnsured = false;
function ensureBoardDir(): void {
  if (boardDirEnsured) return;
  fs.mkdirSync(getBoardDir(), { recursive: true });
  boardDirEnsured = true;
}

// For testing: reset the boardDirEnsured flag
export function resetBoardDirCache(): void {
  boardDirEnsured = false;
}

function projectPath(slug: string): string {
  const dir = getBoardDir();
  const filePath = path.resolve(dir, `${slug}.yaml`);
  // Ensure the resolved path stays within the board directory (prevents traversal)
  if (!filePath.startsWith(dir + path.sep)) {
    throw new Error(`Invalid project slug: ${slug}`);
  }
  return filePath;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function now(): string {
  return new Date().toISOString();
}

/** Ensure tasks loaded from old YAML files have all required array fields */
function normalizeTask(task: Task): Task {
  if (!task.subtasks) task.subtasks = [];
  if (!task.next_subtask_id) task.next_subtask_id = 1;
  if (!task.linked_commits) task.linked_commits = [];
  if (!task.comments) task.comments = [];
  task.execution = task.execution ?? undefined;
  // phase and thread_id on execution are optional — no default needed
  // phase on subtasks is optional — no default needed
  return task;
}

// --- Read/Write ---

export function readProject(slug: string): Project | null {
  const filePath = projectPath(slug);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf-8');
  const project = yaml.load(raw) as Project;
  for (const epic of project.epics) {
    for (const task of epic.tasks) normalizeTask(task);
  }
  return project;
}

export function writeProject(project: Project): void {
  ensureBoardDir();
  const filePath = projectPath(project.slug);
  const raw = yaml.dump(project, { lineWidth: 120 });
  // Atomic write: temp file → rename
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, raw, 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

export function listProjects(): Project[] {
  ensureBoardDir();
  const boardDir = getBoardDir();
  const files = fs.readdirSync(boardDir).filter(f => f.endsWith('.yaml') && !f.includes('.roadmap') && !f.includes('.competitors'));
  return files.map(f => {
    const raw = fs.readFileSync(path.join(boardDir, f), 'utf-8');
    const project = yaml.load(raw) as Project;
    for (const epic of project.epics) {
      for (const task of epic.tasks) normalizeTask(task);
    }
    return project;
  });
}

export function projectsDir(): string {
  ensureBoardDir();
  return getBoardDir();
}

// --- Project operations ---

export function createProject(opts: { name: string; description?: string; color?: string; repo_url?: string }): Project {
  const { name, description, color, repo_url } = opts;
  const slug = slugify(name);
  const existing = readProject(slug);
  if (existing) throw new Error(`Project "${slug}" already exists`);
  const ts = now();
  const project: Project = {
    name,
    slug,
    description,
    color,
    repo_url,
    next_id: 1,
    version: 1,
    epics: [],
    created_at: ts,
    updated_at: ts,
  };
  writeProject(project);
  return project;
}

export function updateProject(
  slug: string,
  updates: Partial<Pick<Project, 'description' | 'color' | 'repo_url'>>,
): Project {
  const project = readProject(slug);
  if (!project) throw new Error(`Project "${slug}" not found`);
  // Strip undefined and empty-string values
  const cleanUpdates = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined && v !== ''));
  Object.assign(project, cleanUpdates);
  project.updated_at = now();
  writeProject(project);
  return project;
}

// --- Epic operations ---

export function createEpic(projectSlug: string, name: string, description?: string): Epic {
  const project = readProject(projectSlug);
  if (!project) throw new Error(`Project "${projectSlug}" not found`);
  const ts = now();
  const epic: Epic = {
    id: project.next_id++,
    name,
    description,
    status: 'active',
    tasks: [],
    created_at: ts,
    updated_at: ts,
  };
  project.epics.push(epic);
  project.updated_at = ts;
  writeProject(project);
  return epic;
}

export function findEpic(project: Project, epicId: number): Epic | undefined {
  return project.epics.find(e => e.id === epicId);
}

export function updateEpicStatus(projectSlug: string, epicId: number, status: EpicStatus): Epic {
  const project = readProject(projectSlug);
  if (!project) throw new Error(`Project "${projectSlug}" not found`);
  const epic = findEpic(project, epicId);
  if (!epic) throw new Error(`Epic ${epicId} not found in project "${projectSlug}"`);
  epic.status = status;
  epic.updated_at = now();
  project.updated_at = epic.updated_at;
  writeProject(project);
  return epic;
}

// --- Task operations ---

export function createTask(
  projectSlug: string,
  epicId: number,
  title: string,
  description?: string,
): Task {
  const project = readProject(projectSlug);
  if (!project) throw new Error(`Project "${projectSlug}" not found`);
  const epic = findEpic(project, epicId);
  if (!epic) throw new Error(`Epic ${epicId} not found`);
  const ts = now();
  const task: Task = {
    id: project.next_id++,
    title,
    description,
    status: 'planning',
    linked_commits: [],
    comments: [],
    subtasks: [],
    next_subtask_id: 1,
    created_at: ts,
    updated_at: ts,
  };
  epic.tasks.push(task);
  epic.updated_at = ts;
  project.updated_at = ts;
  writeProject(project);
  return task;
}

export function findTask(project: Project, taskId: number): { epic: Epic; task: Task } | undefined {
  for (const epic of project.epics) {
    const task = epic.tasks.find(t => t.id === taskId);
    if (task) return { epic, task };
  }
  return undefined;
}

function withTask(projectSlug: string, taskId: number, fn: (task: Task, epic: Epic, project: Project) => void): Task {
  const project = readProject(projectSlug);
  if (!project) throw new Error(`Project "${projectSlug}" not found`);
  const found = findTask(project, taskId);
  if (!found) throw new Error(`Task ${taskId} not found`);
  fn(found.task, found.epic, project);
  const ts = now();
  found.task.updated_at = ts;
  found.epic.updated_at = ts;
  project.updated_at = ts;
  writeProject(project);
  return found.task;
}

export function updateTask(
  projectSlug: string,
  taskId: number,
  updates: Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'category' | 'complexity' | 'no_worktree' | 'default_harness' | 'default_model' | 'linkedFeatureId'>>,
): Task {
  // Strip undefined values so we don't wipe existing fields
  const cleanUpdates = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
  return withTask(projectSlug, taskId, (task) => {
    Object.assign(task, cleanUpdates);
  });
}

export function moveTask(projectSlug: string, taskId: number, status: TaskStatus): Task {
  return updateTask(projectSlug, taskId, { status });
}

export function addComment(
  projectSlug: string,
  taskId: number,
  author: 'claude' | 'user',
  body: string,
): Comment {
  const comment: Comment = { author, timestamp: now(), body };
  withTask(projectSlug, taskId, (task) => {
    task.comments.push(comment);
  });
  return comment;
}

export function linkBranch(projectSlug: string, taskId: number, branch: string, worktreePath?: string): Task {
  return withTask(projectSlug, taskId, (task) => {
    task.branch = branch;
    if (worktreePath) task.worktree_path = worktreePath;
  });
}

export function linkCommit(projectSlug: string, taskId: number, sha: string): Task {
  return withTask(projectSlug, taskId, (task) => {
    if (!task.linked_commits.includes(sha)) task.linked_commits.push(sha);
  });
}

export function blockTask(projectSlug: string, taskId: number, reason: string): Task {
  return withTask(projectSlug, taskId, (task) => {
    task.blocked = true;
    task.blocked_reason = reason;
  });
}

export function unblockTask(projectSlug: string, taskId: number): Task {
  return withTask(projectSlug, taskId, (task) => {
    task.blocked = false;
    task.blocked_reason = undefined;
  });
}

export function updateTaskExecution(
  projectSlug: string,
  taskId: number,
  updates: Partial<Omit<TaskExecution, 'terminal_id'>>,
): Task {
  const cleanUpdates = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
  return withTask(projectSlug, taskId, (task) => {
    if (!task.execution) task.execution = { status: 'idle', harness_id: 'claude' };
    Object.assign(task.execution, cleanUpdates);
  });
}

export function updateProjectSettings(
  slug: string,
  updates: Partial<Pick<Project, 'default_harness' | 'default_model' | 'max_concurrent'>>,
): Project {
  const project = readProject(slug);
  if (!project) throw new Error(`Project "${slug}" not found`);
  const cleanUpdates = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
  Object.assign(project, cleanUpdates);
  project.updated_at = now();
  writeProject(project);
  return project;
}

// --- Subtask operations ---

export function addSubtask(
  projectSlug: string,
  taskId: number,
  title: string,
  description?: string,
): Subtask {
  let subtask!: Subtask;
  withTask(projectSlug, taskId, (task) => {
    subtask = {
      id: task.next_subtask_id++,
      title,
      description,
      status: 'pending',
      files: [],
    };
    task.subtasks.push(subtask);
  });
  return subtask;
}

export function updateSubtask(
  projectSlug: string,
  taskId: number,
  subtaskId: number,
  updates: Partial<Pick<Subtask, 'title' | 'description' | 'status'>>,
): Subtask {
  let subtask!: Subtask;
  const cleanUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined),
  );
  withTask(projectSlug, taskId, (task) => {
    const found = task.subtasks.find(s => s.id === subtaskId);
    if (!found) throw new Error(`Subtask ${subtaskId} not found on task ${taskId}`);
    Object.assign(found, cleanUpdates);
    subtask = found;
  });
  return subtask;
}

export function removeSubtask(
  projectSlug: string,
  taskId: number,
  subtaskId: number,
): void {
  withTask(projectSlug, taskId, (task) => {
    const idx = task.subtasks.findIndex(s => s.id === subtaskId);
    if (idx === -1) throw new Error(`Subtask ${subtaskId} not found on task ${taskId}`);
    task.subtasks.splice(idx, 1);
  });
}

export function addSubtaskFile(
  projectSlug: string,
  taskId: number,
  subtaskId: number,
  filePath: string,
): Subtask {
  let subtask!: Subtask;
  withTask(projectSlug, taskId, (task) => {
    const found = task.subtasks.find(s => s.id === subtaskId);
    if (!found) throw new Error(`Subtask ${subtaskId} not found on task ${taskId}`);
    if (!found.files.includes(filePath)) found.files.push(filePath);
    subtask = found;
  });
  return subtask;
}

export type TaskFilter = {
  project?: string;
  epicId?: number;
  status?: TaskStatus;
};

export function listTasks(filter: TaskFilter = {}): Array<Task & { project_slug: string; epic_id: number; epic_name: string }> {
  const projects = filter.project ? [readProject(filter.project)].filter(Boolean) as Project[] : listProjects();
  const results: Array<Task & { project_slug: string; epic_id: number; epic_name: string }> = [];
  for (const project of projects) {
    for (const epic of project.epics) {
      if (filter.epicId !== undefined && epic.id !== filter.epicId) continue;
      for (const task of epic.tasks) {
        if (filter.status && task.status !== filter.status) continue;
        results.push({ ...task, project_slug: project.slug, epic_id: epic.id, epic_name: epic.name });
      }
    }
  }
  return results;
}
