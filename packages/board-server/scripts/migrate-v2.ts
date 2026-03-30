/**
 * Migrate existing YAML project files to schema version 2.
 *
 * Changes applied:
 *   version: 1 → 2
 *   no_worktree: true  → use_worktree: false  (field rename + invert)
 *   no_worktree absent → use_worktree: true
 *   priority: 'urgent' → 'critical'
 *   Add missing defaults: subtasks: [], reference_images: []
 *
 * Usage:
 *   npx tsx scripts/migrate-v2.ts [--dry-run]
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import yaml from 'js-yaml';

const PROJECTS_DIR = path.join(os.homedir(), '.harness', 'board', 'projects');
const DRY_RUN = process.argv.includes('--dry-run');

interface TaskLike {
  id: number;
  title?: string;
  status: string;
  priority?: string;
  no_worktree?: boolean;
  use_worktree?: boolean;
  subtasks?: unknown[];
  reference_images?: unknown[];
}

interface EpicLike {
  id: number;
  name?: string;
  tasks: TaskLike[];
}

interface ProjectLike {
  name: string;
  slug: string;
  version?: number;
  epics: EpicLike[];
}

function migrate(): void {
  if (!fs.existsSync(PROJECTS_DIR)) {
    console.log(`No projects directory found at ${PROJECTS_DIR}. Nothing to migrate.`);
    return;
  }

  const files = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.yaml'));

  if (files.length === 0) {
    console.log('No project files found. Nothing to migrate.');
    return;
  }

  let totalChanges = 0;

  for (const file of files) {
    const filePath = path.join(PROJECTS_DIR, file);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const project = yaml.load(raw) as ProjectLike;

    if (!project?.epics) continue;

    const changes: string[] = [];

    // version bump
    if (!project.version || project.version < 2) {
      changes.push(`  Project: version ${project.version ?? '(none)'} → 2`);
      (project as { version: number }).version = 2;
    }

    for (const epic of project.epics) {
      if (!epic.tasks) continue;
      for (const task of epic.tasks) {
        // priority: urgent → critical
        if (task.priority === 'urgent') {
          changes.push(`  Task #${task.id} "${task.title ?? '(untitled)'}": priority urgent → critical`);
          task.priority = 'critical';
        }

        // no_worktree → use_worktree
        if ('no_worktree' in task) {
          const newVal = !task.no_worktree;
          changes.push(`  Task #${task.id} "${task.title ?? '(untitled)'}": no_worktree:${task.no_worktree} → use_worktree:${newVal}`);
          task.use_worktree = newVal;
          delete task.no_worktree;
        } else if (task.use_worktree === undefined) {
          task.use_worktree = true;
        }

        // add missing defaults
        if (!Array.isArray(task.subtasks)) {
          task.subtasks = [];
        }
        if (!Array.isArray(task.reference_images)) {
          task.reference_images = [];
        }
      }
    }

    if (changes.length === 0) {
      console.log(`${file}: no changes needed`);
      continue;
    }

    totalChanges += changes.length;
    console.log(`${file}: ${changes.length} change(s)`);
    for (const c of changes) console.log(c);

    if (!DRY_RUN) {
      const out = yaml.dump(project, { lineWidth: 120 });
      const tmpPath = `${filePath}.tmp`;
      fs.writeFileSync(tmpPath, out, 'utf-8');
      fs.renameSync(tmpPath, filePath);
      console.log(`  written`);
    } else {
      console.log(`  (dry-run, no changes written)`);
    }
  }

  console.log(`\nTotal: ${totalChanges} change(s)${DRY_RUN ? ' (dry-run)' : ' applied'}`);
}

migrate();
