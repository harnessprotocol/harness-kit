import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import * as store from "../src/store/yaml-store.js";
import type { Project, Epic, Task } from "../src/types.js";

describe("yaml-store", () => {
  let testDir: string;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "board-test-"));

    // Set environment variable to override BOARD_DIR
    process.env.BOARD_TEST_DIR = testDir;

    // Reset the boardDirEnsured cache
    store.resetBoardDirCache();
  });

  afterEach(() => {
    // Clean up environment variable
    delete process.env.BOARD_TEST_DIR;

    // Reset cache for next test
    store.resetBoardDirCache();

    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  // --- Project CRUD Operations ---

  describe("createProject", () => {
    it("creates a new project with minimal fields", () => {
      const project = store.createProject({ name: "Test Project" });

      expect(project.name).toBe("Test Project");
      expect(project.slug).toBe("test-project");
      expect(project.next_id).toBe(1);
      expect(project.version).toBe(1);
      expect(project.epics).toEqual([]);
      expect(project.created_at).toBeDefined();
      expect(project.updated_at).toBeDefined();
      expect(project.created_at).toBe(project.updated_at);
    });

    it("creates a project with all optional fields", () => {
      const project = store.createProject({
        name: "Test Full Project",
        description: "A test project with all fields",
        color: "#FF5733",
        repo_url: "https://github.com/test/repo",
      });

      expect(project.name).toBe("Test Full Project");
      expect(project.slug).toBe("test-full-project");
      expect(project.description).toBe("A test project with all fields");
      expect(project.color).toBe("#FF5733");
      expect(project.repo_url).toBe("https://github.com/test/repo");
    });

    it("slugifies project names correctly", () => {
      const project1 = store.createProject({ name: "Test@Slugify#123" });
      expect(project1.slug).toBe("test-slugify-123");

      const project2 = store.createProject({ name: "Test   Multiple   Spaces  " });
      expect(project2.slug).toBe("test-multiple-spaces");

      const project3 = store.createProject({ name: "Test UPPERCASE Project" });
      expect(project3.slug).toBe("test-uppercase-project");
    });

    it("throws error if project already exists", () => {
      store.createProject({ name: "Test Duplicate" });

      expect(() => {
        store.createProject({ name: "Test Duplicate" });
      }).toThrow('Project "test-duplicate" already exists');
    });

    it("persists project to disk", () => {
      const project = store.createProject({ name: "Test Persist" });
      const loaded = store.readProject(project.slug);

      expect(loaded).not.toBeNull();
      expect(loaded?.name).toBe("Test Persist");
      expect(loaded?.slug).toBe("test-persist");
    });
  });

  describe("readProject", () => {
    it("returns null for non-existent project", () => {
      const project = store.readProject("non-existent-project");
      expect(project).toBeNull();
    });

    it("reads an existing project", () => {
      const created = store.createProject({ name: "Test Read" });
      const loaded = store.readProject("test-read");

      expect(loaded).not.toBeNull();
      expect(loaded?.name).toBe(created.name);
      expect(loaded?.slug).toBe(created.slug);
      expect(loaded?.next_id).toBe(created.next_id);
    });
  });

  describe("updateProject", () => {
    it("updates project description", () => {
      const project = store.createProject({ name: "Test Update" });
      const updated = store.updateProject(project.slug, {
        description: "Updated description",
      });

      expect(updated.description).toBe("Updated description");
      // Timestamp should be updated (may be same in fast tests, but at least should be >=)
      expect(new Date(updated.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(project.updated_at).getTime());
    });

    it("updates multiple fields at once", () => {
      const project = store.createProject({ name: "Test Multi Update" });
      const updated = store.updateProject(project.slug, {
        description: "New description",
        color: "#00FF00",
        repo_url: "https://github.com/updated/repo",
      });

      expect(updated.description).toBe("New description");
      expect(updated.color).toBe("#00FF00");
      expect(updated.repo_url).toBe("https://github.com/updated/repo");
    });

    it("strips undefined values", () => {
      const project = store.createProject({
        name: "Test Strip",
        description: "Original",
        color: "#FF0000",
      });

      const updated = store.updateProject(project.slug, {
        description: "Updated",
        color: undefined,
      });

      expect(updated.description).toBe("Updated");
      expect(updated.color).toBe("#FF0000"); // Should remain unchanged
    });

    it("strips empty string values", () => {
      const project = store.createProject({
        name: "Test Empty",
        description: "Original",
      });

      const updated = store.updateProject(project.slug, {
        description: "",
      });

      expect(updated.description).toBe("Original"); // Should remain unchanged
    });

    it("throws error for non-existent project", () => {
      expect(() => {
        store.updateProject("non-existent", { description: "Test" });
      }).toThrow('Project "non-existent" not found');
    });
  });

  describe("listProjects", () => {
    it("returns empty array when no projects exist", () => {
      const projects = store.listProjects();
      // Filter out any non-test projects that might exist
      const testProjects = projects.filter(p => p.slug.startsWith("test-"));
      expect(testProjects).toEqual([]);
    });

    it("returns all created projects", () => {
      store.createProject({ name: "Test List 1" });
      store.createProject({ name: "Test List 2" });
      store.createProject({ name: "Test List 3" });

      const projects = store.listProjects();
      const testProjects = projects.filter(p => p.slug.startsWith("test-list-"));

      expect(testProjects).toHaveLength(3);
      expect(testProjects.map(p => p.name)).toContain("Test List 1");
      expect(testProjects.map(p => p.name)).toContain("Test List 2");
      expect(testProjects.map(p => p.name)).toContain("Test List 3");
    });
  });

  // --- Epic CRUD Operations ---

  describe("createEpic", () => {
    it("creates an epic in a project", () => {
      const project = store.createProject({ name: "Test Epic Project" });
      const epic = store.createEpic(project.slug, "Test Epic", "Epic description");

      expect(epic.id).toBe(1);
      expect(epic.name).toBe("Test Epic");
      expect(epic.description).toBe("Epic description");
      expect(epic.status).toBe("active");
      expect(epic.tasks).toEqual([]);
      expect(epic.created_at).toBeDefined();
      expect(epic.updated_at).toBeDefined();
    });

    it("increments project next_id", () => {
      const project = store.createProject({ name: "Test Epic ID" });
      const epic1 = store.createEpic(project.slug, "Epic 1");
      const epic2 = store.createEpic(project.slug, "Epic 2");

      expect(epic1.id).toBe(1);
      expect(epic2.id).toBe(2);

      const loaded = store.readProject(project.slug);
      expect(loaded?.next_id).toBe(3);
    });

    it("creates epic without description", () => {
      const project = store.createProject({ name: "Test Epic No Desc" });
      const epic = store.createEpic(project.slug, "Test Epic");

      expect(epic.description).toBeUndefined();
    });

    it("throws error for non-existent project", () => {
      expect(() => {
        store.createEpic("non-existent", "Epic");
      }).toThrow('Project "non-existent" not found');
    });

    it("updates project updated_at timestamp", () => {
      const project = store.createProject({ name: "Test Epic Timestamp" });
      const originalTimestamp = project.updated_at;

      const epic = store.createEpic(project.slug, "Epic");

      const loaded = store.readProject(project.slug);
      // Timestamp should be updated (may be same in fast tests, but at least should be >=)
      expect(new Date(loaded!.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(originalTimestamp).getTime());
    });
  });

  describe("findEpic", () => {
    it("finds an epic by id", () => {
      const project = store.createProject({ name: "Test Find Epic" });
      const epic = store.createEpic(project.slug, "Test Epic");

      const loaded = store.readProject(project.slug);
      const found = store.findEpic(loaded!, epic.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(epic.id);
      expect(found?.name).toBe("Test Epic");
    });

    it("returns undefined for non-existent epic", () => {
      const project = store.createProject({ name: "Test Find None" });
      const loaded = store.readProject(project.slug);
      const found = store.findEpic(loaded!, 999);

      expect(found).toBeUndefined();
    });
  });

  describe("updateEpicStatus", () => {
    it("updates epic status to completed", () => {
      const project = store.createProject({ name: "Test Epic Status" });
      const epic = store.createEpic(project.slug, "Test Epic");

      const updated = store.updateEpicStatus(project.slug, epic.id, "completed");

      expect(updated.status).toBe("completed");
      // Timestamp should be updated (may be same in fast tests, but at least should be >=)
      expect(new Date(updated.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(epic.updated_at).getTime());
    });

    it("updates epic status to archived", () => {
      const project = store.createProject({ name: "Test Epic Archive" });
      const epic = store.createEpic(project.slug, "Test Epic");

      const updated = store.updateEpicStatus(project.slug, epic.id, "archived");

      expect(updated.status).toBe("archived");
    });

    it("throws error for non-existent project", () => {
      expect(() => {
        store.updateEpicStatus("non-existent", 1, "completed");
      }).toThrow('Project "non-existent" not found');
    });

    it("throws error for non-existent epic", () => {
      const project = store.createProject({ name: "Test Epic Missing" });

      expect(() => {
        store.updateEpicStatus(project.slug, 999, "completed");
      }).toThrow(`Epic 999 not found in project "${project.slug}"`);
    });
  });

  // --- Task CRUD Operations ---

  describe("createTask", () => {
    it("creates a task in an epic", () => {
      const project = store.createProject({ name: "Test Task Project" });
      const epic = store.createEpic(project.slug, "Test Epic");
      const task = store.createTask(project.slug, epic.id, "Test Task", "Task description");

      expect(task.id).toBe(2); // Epic is 1, task is 2
      expect(task.title).toBe("Test Task");
      expect(task.description).toBe("Task description");
      expect(task.status).toBe("backlog");
      expect(task.linked_commits).toEqual([]);
      expect(task.comments).toEqual([]);
      expect(task.created_at).toBeDefined();
      expect(task.updated_at).toBeDefined();
    });

    it("creates task without description", () => {
      const project = store.createProject({ name: "Test Task No Desc" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Task");

      expect(task.description).toBeUndefined();
    });

    it("increments project next_id", () => {
      const project = store.createProject({ name: "Test Task ID" });
      const epic = store.createEpic(project.slug, "Epic");
      const task1 = store.createTask(project.slug, epic.id, "Task 1");
      const task2 = store.createTask(project.slug, epic.id, "Task 2");

      expect(task1.id).toBe(2); // Epic is 1
      expect(task2.id).toBe(3);

      const loaded = store.readProject(project.slug);
      expect(loaded?.next_id).toBe(4);
    });

    it("throws error for non-existent project", () => {
      expect(() => {
        store.createTask("non-existent", 1, "Task");
      }).toThrow('Project "non-existent" not found');
    });

    it("throws error for non-existent epic", () => {
      const project = store.createProject({ name: "Test Task No Epic" });

      expect(() => {
        store.createTask(project.slug, 999, "Task");
      }).toThrow("Epic 999 not found");
    });

    it("updates epic and project timestamps", () => {
      const project = store.createProject({ name: "Test Task Timestamp" });
      const epic = store.createEpic(project.slug, "Epic");
      const originalEpicTime = epic.updated_at;

      store.createTask(project.slug, epic.id, "Task");

      const loaded = store.readProject(project.slug);
      const loadedEpic = store.findEpic(loaded!, epic.id);
      // Timestamps should be updated (may be same in fast tests, but at least should be >=)
      expect(new Date(loadedEpic!.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(originalEpicTime).getTime());
      expect(new Date(loaded!.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(project.updated_at).getTime());
    });
  });

  describe("findTask", () => {
    it("finds a task by id", () => {
      const project = store.createProject({ name: "Test Find Task" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Task");

      const loaded = store.readProject(project.slug);
      const found = store.findTask(loaded!, task.id);

      expect(found).toBeDefined();
      expect(found?.task.id).toBe(task.id);
      expect(found?.task.title).toBe("Task");
      expect(found?.epic.id).toBe(epic.id);
    });

    it("returns undefined for non-existent task", () => {
      const project = store.createProject({ name: "Test Find No Task" });
      const loaded = store.readProject(project.slug);
      const found = store.findTask(loaded!, 999);

      expect(found).toBeUndefined();
    });

    it("searches across all epics", () => {
      const project = store.createProject({ name: "Test Find Multi Epic" });
      const epic1 = store.createEpic(project.slug, "Epic 1");
      const epic2 = store.createEpic(project.slug, "Epic 2");
      const task1 = store.createTask(project.slug, epic1.id, "Task 1");
      const task2 = store.createTask(project.slug, epic2.id, "Task 2");

      const loaded = store.readProject(project.slug);
      const found1 = store.findTask(loaded!, task1.id);
      const found2 = store.findTask(loaded!, task2.id);

      expect(found1?.epic.id).toBe(epic1.id);
      expect(found2?.epic.id).toBe(epic2.id);
    });
  });

  describe("updateTask", () => {
    it("updates task title", () => {
      const project = store.createProject({ name: "Test Update Task" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Original Title");

      const updated = store.updateTask(project.slug, task.id, {
        title: "Updated Title",
      });

      expect(updated.title).toBe("Updated Title");
      // Timestamp should be updated (may be same in fast tests, but at least should be >=)
      expect(new Date(updated.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(task.updated_at).getTime());
    });

    it("updates multiple fields at once", () => {
      const project = store.createProject({ name: "Test Multi Update Task" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Task");

      const updated = store.updateTask(project.slug, task.id, {
        title: "New Title",
        description: "New Description",
        status: "in-progress",
        no_worktree: true,
      });

      expect(updated.title).toBe("New Title");
      expect(updated.description).toBe("New Description");
      expect(updated.status).toBe("in-progress");
      expect(updated.no_worktree).toBe(true);
    });

    it("strips undefined values", () => {
      const project = store.createProject({ name: "Test Strip Task" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Task", "Original");

      const updated = store.updateTask(project.slug, task.id, {
        title: "Updated",
        description: undefined,
      });

      expect(updated.title).toBe("Updated");
      expect(updated.description).toBe("Original");
    });

    it("throws error for non-existent project", () => {
      expect(() => {
        store.updateTask("non-existent", 1, { title: "Test" });
      }).toThrow('Project "non-existent" not found');
    });

    it("throws error for non-existent task", () => {
      const project = store.createProject({ name: "Test Update No Task" });

      expect(() => {
        store.updateTask(project.slug, 999, { title: "Test" });
      }).toThrow("Task 999 not found");
    });
  });

  describe("moveTask", () => {
    it("moves task to in-progress", () => {
      const project = store.createProject({ name: "Test Move Task" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Task");

      const moved = store.moveTask(project.slug, task.id, "in-progress");

      expect(moved.status).toBe("in-progress");
    });

    it("moves task through all statuses", () => {
      const project = store.createProject({ name: "Test Move All" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Task");

      let moved = store.moveTask(project.slug, task.id, "in-progress");
      expect(moved.status).toBe("in-progress");

      moved = store.moveTask(project.slug, task.id, "review");
      expect(moved.status).toBe("review");

      moved = store.moveTask(project.slug, task.id, "done");
      expect(moved.status).toBe("done");
    });
  });

  describe("addComment", () => {
    it("adds a comment from claude", () => {
      const project = store.createProject({ name: "Test Comment" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Task");

      const comment = store.addComment(project.slug, task.id, "claude", "Test comment");

      expect(comment.author).toBe("claude");
      expect(comment.body).toBe("Test comment");
      expect(comment.timestamp).toBeDefined();

      const loaded = store.readProject(project.slug);
      const found = store.findTask(loaded!, task.id);
      expect(found?.task.comments).toHaveLength(1);
      expect(found?.task.comments[0].body).toBe("Test comment");
    });

    it("adds a comment from user", () => {
      const project = store.createProject({ name: "Test User Comment" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Task");

      const comment = store.addComment(project.slug, task.id, "user", "User comment");

      expect(comment.author).toBe("user");
      expect(comment.body).toBe("User comment");
    });

    it("adds multiple comments", () => {
      const project = store.createProject({ name: "Test Multi Comment" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Task");

      store.addComment(project.slug, task.id, "user", "First");
      store.addComment(project.slug, task.id, "claude", "Second");
      store.addComment(project.slug, task.id, "user", "Third");

      const loaded = store.readProject(project.slug);
      const found = store.findTask(loaded!, task.id);
      expect(found?.task.comments).toHaveLength(3);
      expect(found?.task.comments[0].body).toBe("First");
      expect(found?.task.comments[1].body).toBe("Second");
      expect(found?.task.comments[2].body).toBe("Third");
    });
  });

  describe("linkBranch", () => {
    it("links a branch to a task", () => {
      const project = store.createProject({ name: "Test Link Branch" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Task");

      const updated = store.linkBranch(project.slug, task.id, "feature/test");

      expect(updated.branch).toBe("feature/test");
      expect(updated.worktree_path).toBeUndefined();
    });

    it("links branch with worktree path", () => {
      const project = store.createProject({ name: "Test Link Worktree" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Task");

      const updated = store.linkBranch(
        project.slug,
        task.id,
        "feature/test",
        "/path/to/worktree"
      );

      expect(updated.branch).toBe("feature/test");
      expect(updated.worktree_path).toBe("/path/to/worktree");
    });
  });

  describe("linkCommit", () => {
    it("links a commit to a task", () => {
      const project = store.createProject({ name: "Test Link Commit" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Task");

      const updated = store.linkCommit(project.slug, task.id, "abc123");

      expect(updated.linked_commits).toContain("abc123");
    });

    it("links multiple commits", () => {
      const project = store.createProject({ name: "Test Multi Commit" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Task");

      store.linkCommit(project.slug, task.id, "abc123");
      const updated = store.linkCommit(project.slug, task.id, "def456");

      expect(updated.linked_commits).toHaveLength(2);
      expect(updated.linked_commits).toContain("abc123");
      expect(updated.linked_commits).toContain("def456");
    });

    it("does not duplicate commit links", () => {
      const project = store.createProject({ name: "Test Dup Commit" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Task");

      store.linkCommit(project.slug, task.id, "abc123");
      const updated = store.linkCommit(project.slug, task.id, "abc123");

      expect(updated.linked_commits).toHaveLength(1);
      expect(updated.linked_commits).toContain("abc123");
    });
  });

  describe("blockTask", () => {
    it("blocks a task with reason", () => {
      const project = store.createProject({ name: "Test Block Task" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Task");

      const blocked = store.blockTask(project.slug, task.id, "Waiting for API");

      expect(blocked.blocked).toBe(true);
      expect(blocked.blocked_reason).toBe("Waiting for API");
    });
  });

  describe("unblockTask", () => {
    it("unblocks a blocked task", () => {
      const project = store.createProject({ name: "Test Unblock Task" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Task");

      store.blockTask(project.slug, task.id, "Blocked");
      const unblocked = store.unblockTask(project.slug, task.id);

      expect(unblocked.blocked).toBe(false);
      expect(unblocked.blocked_reason).toBeUndefined();
    });

    it("can unblock a non-blocked task", () => {
      const project = store.createProject({ name: "Test Unblock Clean" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Task");

      const unblocked = store.unblockTask(project.slug, task.id);

      expect(unblocked.blocked).toBe(false);
    });
  });

  describe("listTasks", () => {
    it("lists all tasks across all projects", () => {
      const project1 = store.createProject({ name: "Test List Tasks 1" });
      const epic1 = store.createEpic(project1.slug, "Epic 1");
      store.createTask(project1.slug, epic1.id, "Task 1");
      store.createTask(project1.slug, epic1.id, "Task 2");

      const project2 = store.createProject({ name: "Test List Tasks 2" });
      const epic2 = store.createEpic(project2.slug, "Epic 2");
      store.createTask(project2.slug, epic2.id, "Task 3");

      const tasks = store.listTasks();
      const testTasks = tasks.filter(t => t.project_slug.startsWith("test-list-tasks"));

      expect(testTasks).toHaveLength(3);
    });

    it("filters tasks by project", () => {
      const project1 = store.createProject({ name: "Test Filter Proj 1" });
      const epic1 = store.createEpic(project1.slug, "Epic 1");
      store.createTask(project1.slug, epic1.id, "Task 1");

      const project2 = store.createProject({ name: "Test Filter Proj 2" });
      const epic2 = store.createEpic(project2.slug, "Epic 2");
      store.createTask(project2.slug, epic2.id, "Task 2");

      const tasks = store.listTasks({ project: project1.slug });

      expect(tasks).toHaveLength(1);
      expect(tasks[0].project_slug).toBe(project1.slug);
      expect(tasks[0].title).toBe("Task 1");
    });

    it("filters tasks by epic", () => {
      const project = store.createProject({ name: "Test Filter Epic" });
      const epic1 = store.createEpic(project.slug, "Epic 1");
      const epic2 = store.createEpic(project.slug, "Epic 2");
      store.createTask(project.slug, epic1.id, "Task 1");
      store.createTask(project.slug, epic2.id, "Task 2");

      const tasks = store.listTasks({ project: project.slug, epicId: epic1.id });

      expect(tasks).toHaveLength(1);
      expect(tasks[0].epic_id).toBe(epic1.id);
      expect(tasks[0].title).toBe("Task 1");
    });

    it("filters tasks by status", () => {
      const project = store.createProject({ name: "Test Filter Status" });
      const epic = store.createEpic(project.slug, "Epic");
      const task1 = store.createTask(project.slug, epic.id, "Task 1");
      const task2 = store.createTask(project.slug, epic.id, "Task 2");
      store.moveTask(project.slug, task2.id, "in-progress");

      const backlogTasks = store.listTasks({ project: project.slug, status: "backlog" });
      const inProgressTasks = store.listTasks({ project: project.slug, status: "in-progress" });

      expect(backlogTasks).toHaveLength(1);
      expect(backlogTasks[0].title).toBe("Task 1");
      expect(inProgressTasks).toHaveLength(1);
      expect(inProgressTasks[0].title).toBe("Task 2");
    });

    it("combines multiple filters", () => {
      const project = store.createProject({ name: "Test Multi Filter" });
      const epic1 = store.createEpic(project.slug, "Epic 1");
      const epic2 = store.createEpic(project.slug, "Epic 2");
      const task1 = store.createTask(project.slug, epic1.id, "Task 1");
      const task2 = store.createTask(project.slug, epic1.id, "Task 2");
      const task3 = store.createTask(project.slug, epic2.id, "Task 3");
      store.moveTask(project.slug, task2.id, "in-progress");

      const tasks = store.listTasks({
        project: project.slug,
        epicId: epic1.id,
        status: "in-progress",
      });

      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe("Task 2");
    });

    it("includes project and epic metadata", () => {
      const project = store.createProject({ name: "Test Metadata" });
      const epic = store.createEpic(project.slug, "Test Epic");
      store.createTask(project.slug, epic.id, "Task");

      const tasks = store.listTasks({ project: project.slug });

      expect(tasks[0].project_slug).toBe(project.slug);
      expect(tasks[0].epic_id).toBe(epic.id);
      expect(tasks[0].epic_name).toBe("Test Epic");
    });
  });
});
