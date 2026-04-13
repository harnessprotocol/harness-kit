/**
 * Migrate existing YAML project files from old status values to new ones.
 *
 * Mappings:
 *   backlog  → planning
 *   review   → ai-review
 *
 * Usage:
 *   npx tsx scripts/migrate-statuses.ts [--dry-run]
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";

const BOARD_DIR = path.join(os.homedir(), ".harness", "board", "projects");

const STATUS_MAP: Record<string, string> = {
  backlog: "planning",
  review: "ai-review",
};

interface TaskLike {
  id: number;
  title?: string;
  status: string;
}

interface EpicLike {
  id: number;
  name?: string;
  tasks: TaskLike[];
}

interface ProjectLike {
  name: string;
  slug: string;
  epics: EpicLike[];
}

function migrate(): void {
  const dryRun = process.argv.includes("--dry-run");

  if (!fs.existsSync(BOARD_DIR)) {
    console.log(`No projects directory found at ${BOARD_DIR}. Nothing to migrate.`);
    return;
  }

  const files = fs.readdirSync(BOARD_DIR).filter((f) => f.endsWith(".yaml"));

  if (files.length === 0) {
    console.log("No project files found. Nothing to migrate.");
    return;
  }

  let totalChanges = 0;

  for (const file of files) {
    const filePath = path.join(BOARD_DIR, file);
    const raw = fs.readFileSync(filePath, "utf-8");
    const project = yaml.load(raw) as ProjectLike;

    if (!project?.epics) continue;

    const changes: string[] = [];

    for (const epic of project.epics) {
      if (!epic.tasks) continue;
      for (const task of epic.tasks) {
        const newStatus = STATUS_MAP[task.status];
        if (newStatus) {
          changes.push(
            `  Task #${task.id} "${task.title ?? "(untitled)"}": ${task.status} → ${newStatus}`,
          );
          task.status = newStatus;
        }
      }
    }

    if (changes.length === 0) {
      console.log(`${file}: no changes needed`);
      continue;
    }

    totalChanges += changes.length;
    console.log(`${file}: ${changes.length} status change(s)`);
    for (const c of changes) console.log(c);

    if (!dryRun) {
      const out = yaml.dump(project, { lineWidth: 120 });
      const tmpPath = `${filePath}.tmp`;
      fs.writeFileSync(tmpPath, out, "utf-8");
      fs.renameSync(tmpPath, filePath);
      console.log(`  ✓ written`);
    } else {
      console.log(`  (dry-run, no changes written)`);
    }
  }

  console.log(`\nTotal: ${totalChanges} status change(s)${dryRun ? " (dry-run)" : " applied"}`);
}

migrate();
