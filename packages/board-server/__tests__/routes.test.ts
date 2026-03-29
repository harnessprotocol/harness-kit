import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { createHttpApp } from "../src/http/server.js";
import * as store from "../src/store/yaml-store.js";
import { resetBoardDirCache } from "../src/store/yaml-store.js";
import type { Express } from "express";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("HTTP Routes", () => {
  let app: Express;
  let tempDir: string;

  beforeAll(() => {
    tempDir = path.join(os.tmpdir(), 'board-test-' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });
    process.env.NODE_ENV = 'test';
    process.env.BOARD_TEST_DIR = tempDir;
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.BOARD_TEST_DIR;
  });

  beforeEach(() => {
    // Reset the board dir cache so the store picks up the temp dir
    resetBoardDirCache();
    // Wipe the temp dir contents between tests for isolation
    if (fs.existsSync(tempDir)) {
      for (const file of fs.readdirSync(tempDir)) {
        fs.rmSync(path.join(tempDir, file), { force: true });
      }
    }

    // Create fresh app for each test
    app = createHttpApp();
  });

  // --- Health Check ---

  describe("GET /health", () => {
    it("returns health status", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, service: 'harness-board' });
    });
  });

  // --- Projects ---

  describe("GET /api/v1/projects", () => {
    it("returns array of projects", async () => {
      const res = await request(app).get("/api/v1/projects");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("returns list including created projects", async () => {
      store.createProject({ name: "Test Project 1" });
      store.createProject({ name: "Test Project 2" });

      const res = await request(app).get("/api/v1/projects");
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(2);

      // Check our test projects are in the list
      const projectNames = res.body.map((p: any) => p.name);
      expect(projectNames).toContain("Test Project 1");
      expect(projectNames).toContain("Test Project 2");
    });
  });

  describe("POST /api/v1/projects", () => {
    it("creates a new project with required fields", async () => {
      const res = await request(app)
        .post("/api/v1/projects")
        .send({ name: "New Project" });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe("New Project");
      expect(res.body.slug).toBe("new-project");
      expect(res.body.epics).toEqual([]);
      expect(res.body.next_id).toBe(1);
    });

    it("creates a project with all optional fields", async () => {
      const res = await request(app)
        .post("/api/v1/projects")
        .send({
          name: "Full Project",
          description: "A test project",
          color: "#FF5733",
          repo_url: "https://github.com/user/repo",
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Full Project");
      expect(res.body.description).toBe("A test project");
      expect(res.body.color).toBe("#FF5733");
      expect(res.body.repo_url).toBe("https://github.com/user/repo");
    });

    it("returns 400 when name is missing", async () => {
      const res = await request(app)
        .post("/api/v1/projects")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("name is required");
    });

    it("returns 400 when project already exists", async () => {
      await request(app)
        .post("/api/v1/projects")
        .send({ name: "Duplicate Project" });

      const res = await request(app)
        .post("/api/v1/projects")
        .send({ name: "Duplicate Project" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("already exists");
    });
  });

  describe("GET /api/v1/projects/:slug", () => {
    it("returns a single project", async () => {
      store.createProject({ name: "Test Project" });

      const res = await request(app).get("/api/v1/projects/test-project");
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Test Project");
      expect(res.body.slug).toBe("test-project");
    });

    it("returns 404 for non-existent project", async () => {
      const res = await request(app).get("/api/v1/projects/non-existent");
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Not found");
    });
  });

  describe("PATCH /api/v1/projects/:slug", () => {
    it("updates project description", async () => {
      store.createProject({ name: "Test Project" });

      const res = await request(app)
        .patch("/api/v1/projects/test-project")
        .send({ description: "Updated description" });

      expect(res.status).toBe(200);
      expect(res.body.description).toBe("Updated description");
    });

    it("updates project color", async () => {
      store.createProject({ name: "Test Project" });

      const res = await request(app)
        .patch("/api/v1/projects/test-project")
        .send({ color: "#00FF00" });

      expect(res.status).toBe(200);
      expect(res.body.color).toBe("#00FF00");
    });

    it("updates project repo_url", async () => {
      store.createProject({ name: "Test Project" });

      const res = await request(app)
        .patch("/api/v1/projects/test-project")
        .send({ repo_url: "https://github.com/new/repo" });

      expect(res.status).toBe(200);
      expect(res.body.repo_url).toBe("https://github.com/new/repo");
    });

    it("updates multiple fields at once", async () => {
      store.createProject({ name: "Test Project" });

      const res = await request(app)
        .patch("/api/v1/projects/test-project")
        .send({
          description: "New description",
          color: "#0000FF",
          repo_url: "https://github.com/updated/repo",
        });

      expect(res.status).toBe(200);
      expect(res.body.description).toBe("New description");
      expect(res.body.color).toBe("#0000FF");
      expect(res.body.repo_url).toBe("https://github.com/updated/repo");
    });

    it("returns 400 for non-existent project", async () => {
      const res = await request(app)
        .patch("/api/v1/projects/non-existent")
        .send({ description: "Test" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("not found");
    });
  });

  // --- Epics ---

  describe("POST /api/v1/projects/:slug/epics", () => {
    beforeEach(() => {
      store.createProject({ name: "Test Project" });
    });

    it("creates a new epic with required fields", async () => {
      const res = await request(app)
        .post("/api/v1/projects/test-project/epics")
        .send({ name: "New Epic" });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe("New Epic");
      expect(res.body.id).toBe(1);
      expect(res.body.status).toBe("active");
      expect(res.body.tasks).toEqual([]);
    });

    it("creates an epic with description", async () => {
      const res = await request(app)
        .post("/api/v1/projects/test-project/epics")
        .send({ name: "Epic with Desc", description: "Epic description" });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Epic with Desc");
      expect(res.body.description).toBe("Epic description");
    });

    it("returns 400 when name is missing", async () => {
      const res = await request(app)
        .post("/api/v1/projects/test-project/epics")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("name is required");
    });

    it("returns 400 for non-existent project", async () => {
      const res = await request(app)
        .post("/api/v1/projects/non-existent/epics")
        .send({ name: "Epic" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("not found");
    });

    it("increments project next_id for epic", async () => {
      await request(app)
        .post("/api/v1/projects/test-project/epics")
        .send({ name: "Epic 1" });

      const res = await request(app)
        .post("/api/v1/projects/test-project/epics")
        .send({ name: "Epic 2" });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe(2);
    });
  });

  describe("PATCH /api/v1/projects/:slug/epics/:epicId", () => {
    beforeEach(() => {
      store.createProject({ name: "Test Project" });
      store.createEpic("test-project", "Test Epic");
    });

    it("updates epic status to completed", async () => {
      const res = await request(app)
        .patch("/api/v1/projects/test-project/epics/1")
        .send({ status: "completed" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("completed");
    });

    it("updates epic status to archived", async () => {
      const res = await request(app)
        .patch("/api/v1/projects/test-project/epics/1")
        .send({ status: "archived" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("archived");
    });

    it("returns 400 for non-existent epic", async () => {
      const res = await request(app)
        .patch("/api/v1/projects/test-project/epics/999")
        .send({ status: "completed" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("not found");
    });

    it("returns 400 for non-existent project", async () => {
      const res = await request(app)
        .patch("/api/v1/projects/non-existent/epics/1")
        .send({ status: "completed" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("not found");
    });
  });

  // --- Tasks ---

  describe("POST /api/v1/projects/:slug/epics/:epicId/tasks", () => {
    beforeEach(() => {
      store.createProject({ name: "Test Project" });
      store.createEpic("test-project", "Test Epic");
    });

    it("creates a new task with required fields", async () => {
      const res = await request(app)
        .post("/api/v1/projects/test-project/epics/1/tasks")
        .send({ title: "New Task" });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe("New Task");
      expect(res.body.id).toBe(2); // Epic used ID 1
      expect(res.body.status).toBe("backlog");
      expect(res.body.linked_commits).toEqual([]);
      expect(res.body.comments).toEqual([]);
    });

    it("creates a task with description", async () => {
      const res = await request(app)
        .post("/api/v1/projects/test-project/epics/1/tasks")
        .send({ title: "Task with Desc", description: "Task description" });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe("Task with Desc");
      expect(res.body.description).toBe("Task description");
    });

    it("returns 400 when title is missing", async () => {
      const res = await request(app)
        .post("/api/v1/projects/test-project/epics/1/tasks")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("title is required");
    });

    it("returns 400 for non-existent epic", async () => {
      const res = await request(app)
        .post("/api/v1/projects/test-project/epics/999/tasks")
        .send({ title: "Task" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("not found");
    });

    it("increments project next_id for task", async () => {
      await request(app)
        .post("/api/v1/projects/test-project/epics/1/tasks")
        .send({ title: "Task 1" });

      const res = await request(app)
        .post("/api/v1/projects/test-project/epics/1/tasks")
        .send({ title: "Task 2" });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe(3); // Epic used 1, first task used 2
    });
  });

  describe("GET /api/v1/projects/:slug/tasks", () => {
    beforeEach(() => {
      store.createProject({ name: "Test Project" });
      store.createEpic("test-project", "Epic 1");
      store.createEpic("test-project", "Epic 2");
      store.createTask("test-project", 1, "Task 1");
      store.createTask("test-project", 1, "Task 2");
      store.createTask("test-project", 2, "Task 3");
    });

    it("returns all tasks for a project", async () => {
      const res = await request(app).get("/api/v1/projects/test-project/tasks");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
      expect(res.body[0].title).toBe("Task 1");
      expect(res.body[1].title).toBe("Task 2");
      expect(res.body[2].title).toBe("Task 3");
    });

    it("filters tasks by epic_id", async () => {
      const res = await request(app)
        .get("/api/v1/projects/test-project/tasks")
        .query({ epic_id: 1 });

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].epic_id).toBe(1);
      expect(res.body[1].epic_id).toBe(1);
    });

    it("filters tasks by status", async () => {
      store.updateTask("test-project", 3, { status: "in-progress" });

      const res = await request(app)
        .get("/api/v1/projects/test-project/tasks")
        .query({ status: "backlog" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body.every((t: any) => t.status === "backlog")).toBe(true);
    });

    it("filters tasks by both epic_id and status", async () => {
      store.updateTask("test-project", 4, { status: "in-progress" });

      const res = await request(app)
        .get("/api/v1/projects/test-project/tasks")
        .query({ epic_id: 1, status: "in-progress" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(4);
      expect(res.body[0].status).toBe("in-progress");
    });

    it("returns empty array when no tasks match filters", async () => {
      const res = await request(app)
        .get("/api/v1/projects/test-project/tasks")
        .query({ status: "done" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe("PATCH /api/v1/projects/:slug/tasks/:taskId", () => {
    beforeEach(() => {
      store.createProject({ name: "Test Project" });
      store.createEpic("test-project", "Test Epic");
      store.createTask("test-project", 1, "Test Task", "Original description");
    });

    it("updates task title", async () => {
      const res = await request(app)
        .patch("/api/v1/projects/test-project/tasks/2")
        .send({ title: "Updated Title" });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe("Updated Title");
    });

    it("updates task description", async () => {
      const res = await request(app)
        .patch("/api/v1/projects/test-project/tasks/2")
        .send({ description: "Updated description" });

      expect(res.status).toBe(200);
      expect(res.body.description).toBe("Updated description");
    });

    it("updates task status", async () => {
      const res = await request(app)
        .patch("/api/v1/projects/test-project/tasks/2")
        .send({ status: "in-progress" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("in-progress");
    });

    it("updates task no_worktree flag", async () => {
      const res = await request(app)
        .patch("/api/v1/projects/test-project/tasks/2")
        .send({ no_worktree: true });

      expect(res.status).toBe(200);
      expect(res.body.no_worktree).toBe(true);
    });

    it("updates multiple fields at once", async () => {
      const res = await request(app)
        .patch("/api/v1/projects/test-project/tasks/2")
        .send({
          title: "Multi Update",
          description: "Multi description",
          status: "review",
        });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe("Multi Update");
      expect(res.body.description).toBe("Multi description");
      expect(res.body.status).toBe("review");
    });

    it("returns 400 for non-existent task", async () => {
      const res = await request(app)
        .patch("/api/v1/projects/test-project/tasks/999")
        .send({ title: "Updated" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("not found");
    });

    it("returns 400 for non-existent project", async () => {
      const res = await request(app)
        .patch("/api/v1/projects/non-existent/tasks/2")
        .send({ title: "Updated" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("not found");
    });
  });

  // --- Comments ---

  describe("POST /api/v1/projects/:slug/tasks/:taskId/comments", () => {
    beforeEach(() => {
      store.createProject({ name: "Test Project" });
      store.createEpic("test-project", "Test Epic");
      store.createTask("test-project", 1, "Test Task");
    });

    it("adds a user comment", async () => {
      const res = await request(app)
        .post("/api/v1/projects/test-project/tasks/2/comments")
        .send({ author: "user", body: "This is a comment" });

      expect(res.status).toBe(201);
      expect(res.body.author).toBe("user");
      expect(res.body.body).toBe("This is a comment");
      expect(res.body.timestamp).toBeDefined();
    });

    it("adds a claude comment", async () => {
      const res = await request(app)
        .post("/api/v1/projects/test-project/tasks/2/comments")
        .send({ author: "claude", body: "Claude's comment" });

      expect(res.status).toBe(201);
      expect(res.body.author).toBe("claude");
      expect(res.body.body).toBe("Claude's comment");
    });

    it("returns 400 when author is missing", async () => {
      const res = await request(app)
        .post("/api/v1/projects/test-project/tasks/2/comments")
        .send({ body: "Comment body" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("author and body are required");
    });

    it("returns 400 when body is missing", async () => {
      const res = await request(app)
        .post("/api/v1/projects/test-project/tasks/2/comments")
        .send({ author: "user" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("author and body are required");
    });

    it("returns 400 for non-existent task", async () => {
      const res = await request(app)
        .post("/api/v1/projects/test-project/tasks/999/comments")
        .send({ author: "user", body: "Comment" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("not found");
    });
  });

  // --- Integration scenarios ---

  describe("Integration scenarios", () => {
    it("creates a full project workflow", async () => {
      // Create project
      const project = await request(app)
        .post("/api/v1/projects")
        .send({ name: "Integration Test Project" });
      expect(project.status).toBe(201);

      // Create epic
      const epic = await request(app)
        .post("/api/v1/projects/integration-test-project/epics")
        .send({ name: "Feature Epic" });
      expect(epic.status).toBe(201);

      // Create task
      const task = await request(app)
        .post(`/api/v1/projects/integration-test-project/epics/${epic.body.id}/tasks`)
        .send({ title: "Implement feature" });
      expect(task.status).toBe(201);

      // Move task to in-progress
      const movedTask = await request(app)
        .patch(`/api/v1/projects/integration-test-project/tasks/${task.body.id}`)
        .send({ status: "in-progress" });
      expect(movedTask.status).toBe(200);
      expect(movedTask.body.status).toBe("in-progress");

      // Add comment
      const comment = await request(app)
        .post(`/api/v1/projects/integration-test-project/tasks/${task.body.id}/comments`)
        .send({ author: "claude", body: "Working on this task" });
      expect(comment.status).toBe(201);

      // Complete task
      const completedTask = await request(app)
        .patch(`/api/v1/projects/integration-test-project/tasks/${task.body.id}`)
        .send({ status: "done" });
      expect(completedTask.status).toBe(200);
      expect(completedTask.body.status).toBe("done");

      // Complete epic
      const completedEpic = await request(app)
        .patch(`/api/v1/projects/integration-test-project/epics/${epic.body.id}`)
        .send({ status: "completed" });
      expect(completedEpic.status).toBe(200);
      expect(completedEpic.body.status).toBe("completed");
    });

    it("handles CORS headers correctly", async () => {
      const res = await request(app)
        .get("/api/v1/projects")
        .set("Origin", "http://localhost:3000");

      expect(res.headers["access-control-allow-origin"]).toBeTruthy();
      expect(res.headers["access-control-allow-methods"]).toBeDefined();
      expect(res.headers["access-control-allow-headers"]).toBeDefined();
    });

    it("handles OPTIONS preflight requests", async () => {
      const res = await request(app)
        .options("/api/v1/projects")
        .set("Origin", "http://localhost:3000");

      expect(res.status).toBe(204);
    });
  });
});
