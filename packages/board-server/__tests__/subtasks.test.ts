import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import request from "supertest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import * as store from "../src/store/yaml-store.js";
import { createHttpApp } from "../src/http/server.js";
import type { Express } from "express";

// ── yaml-store subtask operations ──

describe("yaml-store subtasks", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "board-subtask-test-"));
    process.env.BOARD_TEST_DIR = testDir;
    store.resetBoardDirCache();
  });

  afterEach(() => {
    delete process.env.BOARD_TEST_DIR;
    store.resetBoardDirCache();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("addSubtask", () => {
    it("creates a subtask with correct fields", () => {
      const project = store.createProject({ name: "Subtask Project" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Task");

      const subtask = store.addSubtask(project.slug, task.id, "My Subtask");

      expect(subtask.title).toBe("My Subtask");
      expect(subtask.status).toBe("pending");
      expect(subtask.id).toBeDefined();
      expect(typeof subtask.id).toBe("number");
    });

    it("increments next_id for each subtask", () => {
      const project = store.createProject({ name: "Subtask ID" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Task");

      const sub1 = store.addSubtask(project.slug, task.id, "Sub 1");
      const sub2 = store.addSubtask(project.slug, task.id, "Sub 2");

      expect(sub2.id).toBeGreaterThan(sub1.id);

      const loaded = store.readProject(project.slug);
      expect(loaded!.next_id).toBeGreaterThan(sub2.id);
    });

    it("persists subtask in the task's subtasks array", () => {
      const project = store.createProject({ name: "Subtask Persist" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Task");

      store.addSubtask(project.slug, task.id, "Persisted Sub");

      const loaded = store.readProject(project.slug);
      const found = store.findTask(loaded!, task.id);
      expect(found!.task.subtasks).toHaveLength(1);
      expect(found!.task.subtasks[0].title).toBe("Persisted Sub");
      expect(found!.task.subtasks[0].status).toBe("pending");
    });

    it("throws for invalid project", () => {
      expect(() => {
        store.addSubtask("non-existent", 1, "Sub");
      }).toThrow('Project "non-existent" not found');
    });

    it("throws for invalid task", () => {
      const project = store.createProject({ name: "Subtask No Task" });

      expect(() => {
        store.addSubtask(project.slug, 999, "Sub");
      }).toThrow("Task 999 not found");
    });

    it("adds multiple subtasks to a single task", () => {
      const project = store.createProject({ name: "Multi Sub" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Task");

      store.addSubtask(project.slug, task.id, "Sub A");
      store.addSubtask(project.slug, task.id, "Sub B");
      store.addSubtask(project.slug, task.id, "Sub C");

      const loaded = store.readProject(project.slug);
      const found = store.findTask(loaded!, task.id);
      expect(found!.task.subtasks).toHaveLength(3);
    });
  });

  describe("updateSubtask", () => {
    it("updates status from pending to completed and sets completed_at", () => {
      const project = store.createProject({ name: "Update Sub Status" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Task");
      const subtask = store.addSubtask(project.slug, task.id, "Sub");

      const updated = store.updateSubtask(project.slug, task.id, subtask.id, {
        status: "completed",
      });

      expect(updated.status).toBe("completed");
      expect(updated.completed_at).toBeDefined();
      // completed_at should be a valid ISO date
      expect(new Date(updated.completed_at!).getTime()).not.toBeNaN();
    });

    it("clears completed_at when moving back from completed", () => {
      const project = store.createProject({ name: "Clear Completed" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Task");
      const subtask = store.addSubtask(project.slug, task.id, "Sub");

      store.updateSubtask(project.slug, task.id, subtask.id, {
        status: "completed",
      });
      const reverted = store.updateSubtask(project.slug, task.id, subtask.id, {
        status: "pending",
      });

      expect(reverted.status).toBe("pending");
      expect(reverted.completed_at).toBeUndefined();
    });

    it("updates title", () => {
      const project = store.createProject({ name: "Update Sub Title" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Task");
      const subtask = store.addSubtask(project.slug, task.id, "Original");

      const updated = store.updateSubtask(project.slug, task.id, subtask.id, {
        title: "Renamed",
      });

      expect(updated.title).toBe("Renamed");
    });

    it("updates both status and title simultaneously", () => {
      const project = store.createProject({ name: "Update Both" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Task");
      const subtask = store.addSubtask(project.slug, task.id, "Sub");

      const updated = store.updateSubtask(project.slug, task.id, subtask.id, {
        status: "in_progress",
        title: "In Progress Sub",
      });

      expect(updated.status).toBe("in_progress");
      expect(updated.title).toBe("In Progress Sub");
    });

    it("throws for invalid subtask ID", () => {
      const project = store.createProject({ name: "Bad Sub ID" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Task");

      expect(() => {
        store.updateSubtask(project.slug, task.id, 999, { status: "completed" });
      }).toThrow("Subtask 999 not found");
    });

    it("throws for invalid task ID", () => {
      const project = store.createProject({ name: "Bad Task Sub" });

      expect(() => {
        store.updateSubtask(project.slug, 999, 1, { status: "completed" });
      }).toThrow("Task 999 not found");
    });

    it("persists updates to disk", () => {
      const project = store.createProject({ name: "Persist Sub Update" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Task");
      const subtask = store.addSubtask(project.slug, task.id, "Sub");

      store.updateSubtask(project.slug, task.id, subtask.id, {
        status: "completed",
        title: "Done Sub",
      });

      const loaded = store.readProject(project.slug);
      const found = store.findTask(loaded!, task.id);
      const loadedSub = found!.task.subtasks.find(s => s.id === subtask.id);
      expect(loadedSub!.status).toBe("completed");
      expect(loadedSub!.title).toBe("Done Sub");
    });
  });

  describe("removeSubtask", () => {
    it("removes a subtask from the task's subtasks array", () => {
      const project = store.createProject({ name: "Remove Sub" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Task");
      const subtask = store.addSubtask(project.slug, task.id, "To Remove");

      store.removeSubtask(project.slug, task.id, subtask.id);

      const loaded = store.readProject(project.slug);
      const found = store.findTask(loaded!, task.id);
      expect(found!.task.subtasks).toHaveLength(0);
    });

    it("removes only the targeted subtask", () => {
      const project = store.createProject({ name: "Remove One Sub" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Task");
      const sub1 = store.addSubtask(project.slug, task.id, "Keep");
      const sub2 = store.addSubtask(project.slug, task.id, "Remove");
      const sub3 = store.addSubtask(project.slug, task.id, "Also Keep");

      store.removeSubtask(project.slug, task.id, sub2.id);

      const loaded = store.readProject(project.slug);
      const found = store.findTask(loaded!, task.id);
      expect(found!.task.subtasks).toHaveLength(2);
      expect(found!.task.subtasks.map(s => s.title)).toContain("Keep");
      expect(found!.task.subtasks.map(s => s.title)).toContain("Also Keep");
      expect(found!.task.subtasks.map(s => s.title)).not.toContain("Remove");
    });

    it("silently succeeds for non-existent subtask ID (filter is no-op)", () => {
      const project = store.createProject({ name: "Remove Bad Sub" });
      const epic = store.createEpic(project.slug, "Epic");
      const task = store.createTask(project.slug, epic.id, "Task");
      store.addSubtask(project.slug, task.id, "Existing");

      // removeSubtask uses filter, so a non-existent ID is a no-op
      store.removeSubtask(project.slug, task.id, 999);

      const loaded = store.readProject(project.slug);
      const found = store.findTask(loaded!, task.id);
      expect(found!.task.subtasks).toHaveLength(1);
    });

    it("throws for invalid task ID", () => {
      const project = store.createProject({ name: "Remove No Task" });

      expect(() => {
        store.removeSubtask(project.slug, 999, 1);
      }).toThrow("Task 999 not found");
    });
  });
});

// ── HTTP route subtask tests ──

describe("HTTP Subtask Routes", () => {
  let app: Express;
  let tempDir: string;

  beforeAll(() => {
    tempDir = path.join(os.tmpdir(), "board-subtask-routes-" + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });
    process.env.NODE_ENV = "test";
    process.env.BOARD_TEST_DIR = tempDir;
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.BOARD_TEST_DIR;
  });

  beforeEach(() => {
    store.resetBoardDirCache();
    if (fs.existsSync(tempDir)) {
      for (const file of fs.readdirSync(tempDir)) {
        fs.rmSync(path.join(tempDir, file), { force: true });
      }
    }
    app = createHttpApp();

    // Set up a project with an epic and a task for subtask tests
    store.createProject({ name: "Test Project" });
    store.createEpic("test-project", "Test Epic");
    store.createTask("test-project", 1, "Test Task");
  });

  describe("POST /api/v1/projects/:slug/tasks/:taskId/subtasks", () => {
    it("creates a subtask and returns 200", async () => {
      const res = await request(app)
        .post("/api/v1/projects/test-project/tasks/2/subtasks")
        .send({ title: "New Subtask" });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe("New Subtask");
      expect(res.body.status).toBe("pending");
      expect(res.body.id).toBeDefined();
    });

    it("returns 400 when title is missing", async () => {
      const res = await request(app)
        .post("/api/v1/projects/test-project/tasks/2/subtasks")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("title is required");
    });

    it("returns 400 for non-existent project", async () => {
      const res = await request(app)
        .post("/api/v1/projects/non-existent/tasks/2/subtasks")
        .send({ title: "Sub" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("not found");
    });

    it("returns 400 for non-existent task", async () => {
      const res = await request(app)
        .post("/api/v1/projects/test-project/tasks/999/subtasks")
        .send({ title: "Sub" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("not found");
    });

    it("persists subtask so it appears on project read", async () => {
      const createRes = await request(app)
        .post("/api/v1/projects/test-project/tasks/2/subtasks")
        .send({ title: "Persisted Subtask" });

      const projectRes = await request(app).get("/api/v1/projects/test-project");
      const task = projectRes.body.epics[0].tasks[0];
      expect(task.subtasks).toHaveLength(1);
      expect(task.subtasks[0].title).toBe("Persisted Subtask");
      expect(task.subtasks[0].id).toBe(createRes.body.id);
    });
  });

  describe("PATCH /api/v1/projects/:slug/tasks/:taskId/subtasks/:subtaskId", () => {
    it("updates subtask status", async () => {
      const createRes = await request(app)
        .post("/api/v1/projects/test-project/tasks/2/subtasks")
        .send({ title: "Update Me" });
      const sid = createRes.body.id;

      const res = await request(app)
        .patch(`/api/v1/projects/test-project/tasks/2/subtasks/${sid}`)
        .send({ status: "completed" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("completed");
      expect(res.body.completed_at).toBeDefined();
    });

    it("updates subtask title", async () => {
      const createRes = await request(app)
        .post("/api/v1/projects/test-project/tasks/2/subtasks")
        .send({ title: "Original" });
      const sid = createRes.body.id;

      const res = await request(app)
        .patch(`/api/v1/projects/test-project/tasks/2/subtasks/${sid}`)
        .send({ title: "Renamed" });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe("Renamed");
    });

    it("returns 400 for non-existent subtask", async () => {
      const res = await request(app)
        .patch("/api/v1/projects/test-project/tasks/2/subtasks/999")
        .send({ status: "completed" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("not found");
    });
  });

  describe("DELETE /api/v1/projects/:slug/tasks/:taskId/subtasks/:subtaskId", () => {
    it("deletes a subtask and returns 204", async () => {
      const createRes = await request(app)
        .post("/api/v1/projects/test-project/tasks/2/subtasks")
        .send({ title: "Delete Me" });
      const sid = createRes.body.id;

      const res = await request(app)
        .delete(`/api/v1/projects/test-project/tasks/2/subtasks/${sid}`);

      expect(res.status).toBe(204);

      // Verify it's gone
      const projectRes = await request(app).get("/api/v1/projects/test-project");
      const task = projectRes.body.epics[0].tasks[0];
      expect(task.subtasks).toHaveLength(0);
    });

    it("returns 204 for non-existent subtask (filter is no-op)", async () => {
      const res = await request(app)
        .delete("/api/v1/projects/test-project/tasks/2/subtasks/999");

      expect(res.status).toBe(204);
    });

    it("returns 400 for non-existent task", async () => {
      const res = await request(app)
        .delete("/api/v1/projects/test-project/tasks/999/subtasks/1");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("not found");
    });
  });
});
