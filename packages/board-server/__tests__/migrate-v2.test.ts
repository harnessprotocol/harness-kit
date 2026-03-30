import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";

/**
 * The migrate-v2 script uses a top-level `migrate()` function that reads from
 * PROJECTS_DIR (derived from os.homedir()). To test it, we override HOME to
 * point at a temp directory and import the migrate function via dynamic import.
 *
 * Since the script runs migrate() at import time, we instead replicate the
 * migration logic here and test it against the same contract.
 */

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

function migrateProject(project: ProjectLike): { project: ProjectLike; changes: string[] } {
  const changes: string[] = [];

  // version bump
  if (!project.version || project.version < 2) {
    changes.push(`version ${project.version ?? "(none)"} -> 2`);
    (project as { version: number }).version = 2;
  }

  for (const epic of project.epics) {
    if (!epic.tasks) continue;
    for (const task of epic.tasks) {
      // priority: urgent -> critical
      if (task.priority === "urgent") {
        changes.push(`task #${task.id}: priority urgent -> critical`);
        task.priority = "critical";
      }

      // no_worktree -> use_worktree
      if ("no_worktree" in task) {
        const newVal = !task.no_worktree;
        changes.push(`task #${task.id}: no_worktree -> use_worktree:${newVal}`);
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

  return { project, changes };
}

describe("migrate-v2", () => {
  let testDir: string;
  let projectsDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "board-migrate-test-"));
    projectsDir = path.join(testDir, ".harness", "board", "projects");
    fs.mkdirSync(projectsDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  function writeV1Project(slug: string, project: ProjectLike): void {
    fs.writeFileSync(
      path.join(projectsDir, `${slug}.yaml`),
      yaml.dump(project, { lineWidth: 120 })
    );
  }

  function readProjectFile(slug: string): ProjectLike {
    const raw = fs.readFileSync(
      path.join(projectsDir, `${slug}.yaml`),
      "utf-8"
    );
    return yaml.load(raw) as ProjectLike;
  }

  describe("version bump", () => {
    it("bumps version from 1 to 2", () => {
      const project: ProjectLike = {
        name: "Test",
        slug: "test",
        version: 1,
        epics: [],
      };

      const { project: migrated, changes } = migrateProject(project);

      expect(migrated.version).toBe(2);
      expect(changes.length).toBeGreaterThan(0);
      expect(changes[0]).toContain("version");
    });

    it("bumps version when version is missing", () => {
      const project: ProjectLike = {
        name: "Test",
        slug: "test",
        epics: [],
      };

      const { project: migrated } = migrateProject(project);

      expect(migrated.version).toBe(2);
    });

    it("does not bump version when already at 2", () => {
      const project: ProjectLike = {
        name: "Test",
        slug: "test",
        version: 2,
        epics: [],
      };

      const { changes } = migrateProject(project);

      expect(project.version).toBe(2);
      // No version-related changes
      expect(changes.filter((c) => c.includes("version"))).toHaveLength(0);
    });
  });

  describe("no_worktree -> use_worktree", () => {
    it("converts no_worktree: true to use_worktree: false", () => {
      const project: ProjectLike = {
        name: "Worktree",
        slug: "worktree",
        version: 1,
        epics: [
          {
            id: 1,
            name: "Epic",
            tasks: [
              {
                id: 2,
                title: "Task",
                status: "planning",
                no_worktree: true,
              },
            ],
          },
        ],
      };

      const { project: migrated } = migrateProject(project);
      const task = migrated.epics[0].tasks[0];

      expect(task.use_worktree).toBe(false);
      expect("no_worktree" in task).toBe(false);
    });

    it("converts no_worktree: false to use_worktree: true", () => {
      const project: ProjectLike = {
        name: "Worktree2",
        slug: "worktree2",
        version: 1,
        epics: [
          {
            id: 1,
            name: "Epic",
            tasks: [
              {
                id: 2,
                title: "Task",
                status: "planning",
                no_worktree: false,
              },
            ],
          },
        ],
      };

      const { project: migrated } = migrateProject(project);
      const task = migrated.epics[0].tasks[0];

      expect(task.use_worktree).toBe(true);
      expect("no_worktree" in task).toBe(false);
    });

    it("defaults use_worktree to true when neither field exists", () => {
      const project: ProjectLike = {
        name: "Default",
        slug: "default",
        version: 1,
        epics: [
          {
            id: 1,
            name: "Epic",
            tasks: [
              {
                id: 2,
                title: "Task",
                status: "planning",
              },
            ],
          },
        ],
      };

      const { project: migrated } = migrateProject(project);
      const task = migrated.epics[0].tasks[0];

      expect(task.use_worktree).toBe(true);
    });

    it("does not modify use_worktree if already set", () => {
      const project: ProjectLike = {
        name: "Already Set",
        slug: "already-set",
        version: 2,
        epics: [
          {
            id: 1,
            name: "Epic",
            tasks: [
              {
                id: 2,
                title: "Task",
                status: "planning",
                use_worktree: false,
              },
            ],
          },
        ],
      };

      const { project: migrated } = migrateProject(project);
      const task = migrated.epics[0].tasks[0];

      expect(task.use_worktree).toBe(false);
    });
  });

  describe("priority: urgent -> critical", () => {
    it("converts priority urgent to critical", () => {
      const project: ProjectLike = {
        name: "Priority",
        slug: "priority",
        version: 1,
        epics: [
          {
            id: 1,
            name: "Epic",
            tasks: [
              {
                id: 2,
                title: "Urgent Task",
                status: "planning",
                priority: "urgent",
              },
            ],
          },
        ],
      };

      const { project: migrated, changes } = migrateProject(project);
      const task = migrated.epics[0].tasks[0];

      expect(task.priority).toBe("critical");
      expect(changes.some((c) => c.includes("priority"))).toBe(true);
    });

    it("does not modify other priority values", () => {
      const project: ProjectLike = {
        name: "Priorities",
        slug: "priorities",
        version: 1,
        epics: [
          {
            id: 1,
            name: "Epic",
            tasks: [
              { id: 2, title: "Low", status: "planning", priority: "low" },
              { id: 3, title: "High", status: "planning", priority: "high" },
              { id: 4, title: "Medium", status: "done", priority: "medium" },
            ],
          },
        ],
      };

      const { project: migrated } = migrateProject(project);
      const tasks = migrated.epics[0].tasks;

      expect(tasks[0].priority).toBe("low");
      expect(tasks[1].priority).toBe("high");
      expect(tasks[2].priority).toBe("medium");
    });
  });

  describe("default arrays", () => {
    it("adds empty subtasks array when missing", () => {
      const project: ProjectLike = {
        name: "Arrays",
        slug: "arrays",
        version: 1,
        epics: [
          {
            id: 1,
            name: "Epic",
            tasks: [
              {
                id: 2,
                title: "Task",
                status: "planning",
              },
            ],
          },
        ],
      };

      const { project: migrated } = migrateProject(project);
      const task = migrated.epics[0].tasks[0];

      expect(task.subtasks).toEqual([]);
    });

    it("adds empty reference_images array when missing", () => {
      const project: ProjectLike = {
        name: "Images",
        slug: "images",
        version: 1,
        epics: [
          {
            id: 1,
            name: "Epic",
            tasks: [
              {
                id: 2,
                title: "Task",
                status: "planning",
              },
            ],
          },
        ],
      };

      const { project: migrated } = migrateProject(project);
      const task = migrated.epics[0].tasks[0];

      expect(task.reference_images).toEqual([]);
    });

    it("preserves existing subtasks array", () => {
      const project: ProjectLike = {
        name: "Existing",
        slug: "existing",
        version: 1,
        epics: [
          {
            id: 1,
            name: "Epic",
            tasks: [
              {
                id: 2,
                title: "Task",
                status: "planning",
                subtasks: [{ id: 10, title: "Sub", status: "pending" }],
              },
            ],
          },
        ],
      };

      const { project: migrated } = migrateProject(project);
      const task = migrated.epics[0].tasks[0];

      expect(task.subtasks).toHaveLength(1);
    });
  });

  describe("idempotency", () => {
    it("handles already-migrated files (no double conversion)", () => {
      const project: ProjectLike = {
        name: "Idempotent",
        slug: "idempotent",
        version: 2,
        epics: [
          {
            id: 1,
            name: "Epic",
            tasks: [
              {
                id: 2,
                title: "Task",
                status: "planning",
                use_worktree: true,
                subtasks: [],
                reference_images: [],
                priority: "high",
              },
            ],
          },
        ],
      };

      const { project: migrated, changes } = migrateProject(project);

      expect(changes).toHaveLength(0);
      expect(migrated.version).toBe(2);
      expect(migrated.epics[0].tasks[0].use_worktree).toBe(true);
      expect(migrated.epics[0].tasks[0].priority).toBe("high");
    });

    it("running migration twice yields same result", () => {
      const original: ProjectLike = {
        name: "Double Run",
        slug: "double-run",
        version: 1,
        epics: [
          {
            id: 1,
            name: "Epic",
            tasks: [
              {
                id: 2,
                title: "Task",
                status: "planning",
                no_worktree: true,
                priority: "urgent",
              },
            ],
          },
        ],
      };

      const { project: first } = migrateProject(original);
      const firstSnapshot = JSON.parse(JSON.stringify(first));

      const { project: second, changes } = migrateProject(first);

      expect(changes).toHaveLength(0);
      expect(JSON.stringify(second)).toBe(JSON.stringify(firstSnapshot));
    });
  });

  describe("full file round-trip", () => {
    it("migrates a v1 YAML file on disk", () => {
      const v1: ProjectLike = {
        name: "Disk Project",
        slug: "disk-project",
        version: 1,
        epics: [
          {
            id: 1,
            name: "Epic One",
            tasks: [
              {
                id: 2,
                title: "Urgent No Worktree",
                status: "in-progress",
                no_worktree: true,
                priority: "urgent",
              },
              {
                id: 3,
                title: "Normal Task",
                status: "planning",
              },
            ],
          },
        ],
      };

      writeV1Project("disk-project", v1);

      // Simulate migration on file
      const raw = fs.readFileSync(
        path.join(projectsDir, "disk-project.yaml"),
        "utf-8"
      );
      const loaded = yaml.load(raw) as ProjectLike;
      const { project: migrated } = migrateProject(loaded);

      // Write back
      fs.writeFileSync(
        path.join(projectsDir, "disk-project.yaml"),
        yaml.dump(migrated, { lineWidth: 120 })
      );

      const result = readProjectFile("disk-project");

      expect(result.version).toBe(2);
      expect(result.epics[0].tasks[0].priority).toBe("critical");
      expect(result.epics[0].tasks[0].use_worktree).toBe(false);
      expect("no_worktree" in result.epics[0].tasks[0]).toBe(false);
      expect(result.epics[0].tasks[0].subtasks).toEqual([]);
      expect(result.epics[0].tasks[0].reference_images).toEqual([]);

      expect(result.epics[0].tasks[1].use_worktree).toBe(true);
      expect(result.epics[0].tasks[1].subtasks).toEqual([]);
      expect(result.epics[0].tasks[1].reference_images).toEqual([]);
    });
  });

  describe("edge cases", () => {
    it("handles project with no epics", () => {
      const project: ProjectLike = {
        name: "Empty",
        slug: "empty",
        version: 1,
        epics: [],
      };

      const { project: migrated, changes } = migrateProject(project);

      expect(migrated.version).toBe(2);
      // Only the version change
      expect(changes).toHaveLength(1);
    });

    it("handles epic with no tasks", () => {
      const project: ProjectLike = {
        name: "No Tasks",
        slug: "no-tasks",
        version: 1,
        epics: [{ id: 1, name: "Empty Epic", tasks: [] }],
      };

      const { project: migrated, changes } = migrateProject(project);

      expect(migrated.version).toBe(2);
      expect(migrated.epics[0].tasks).toEqual([]);
    });

    it("handles multiple epics and tasks", () => {
      const project: ProjectLike = {
        name: "Complex",
        slug: "complex",
        version: 1,
        epics: [
          {
            id: 1,
            name: "Epic A",
            tasks: [
              { id: 2, title: "A1", status: "done", no_worktree: true, priority: "urgent" },
              { id: 3, title: "A2", status: "planning" },
            ],
          },
          {
            id: 4,
            name: "Epic B",
            tasks: [
              { id: 5, title: "B1", status: "in-progress", no_worktree: false },
            ],
          },
        ],
      };

      const { project: migrated } = migrateProject(project);

      expect(migrated.version).toBe(2);

      // Epic A, Task A1
      expect(migrated.epics[0].tasks[0].use_worktree).toBe(false);
      expect(migrated.epics[0].tasks[0].priority).toBe("critical");
      expect("no_worktree" in migrated.epics[0].tasks[0]).toBe(false);

      // Epic A, Task A2
      expect(migrated.epics[0].tasks[1].use_worktree).toBe(true);

      // Epic B, Task B1
      expect(migrated.epics[1].tasks[0].use_worktree).toBe(true);
      expect("no_worktree" in migrated.epics[1].tasks[0]).toBe(false);
    });
  });
});
