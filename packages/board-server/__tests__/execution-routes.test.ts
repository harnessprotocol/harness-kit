import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { createHttpApp } from "../src/http/server.js";
import * as store from "../src/store/yaml-store.js";
import { resetBoardDirCache } from "../src/store/yaml-store.js";
import type { Express } from "express";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Mock the task runner to avoid spawning real processes
vi.mock("../src/execution/runner.js", () => {
  const mockStart = vi.fn().mockResolvedValue(undefined);
  const mockStop = vi.fn().mockResolvedValue(undefined);
  const mockIsRunning = vi.fn().mockReturnValue(false);

  return {
    taskRunner: {
      start: mockStart,
      stop: mockStop,
      isRunning: mockIsRunning,
    },
  };
});

// Import the mocked runner for assertions
import { taskRunner } from "../src/execution/runner.js";

describe("Execution and Log HTTP Routes", () => {
  let app: Express;
  let tempDir: string;
  let logsDir: string;

  beforeAll(() => {
    tempDir = path.join(os.tmpdir(), "board-exec-routes-" + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });
    logsDir = path.join(os.tmpdir(), "board-exec-logs-" + Date.now());
    fs.mkdirSync(logsDir, { recursive: true });
    process.env.NODE_ENV = "test";
    process.env.BOARD_TEST_DIR = tempDir;
    process.env.BOARD_TEST_LOG_DIR = logsDir;
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.BOARD_TEST_DIR;
    delete process.env.BOARD_TEST_LOG_DIR;
    if (fs.existsSync(logsDir)) {
      fs.rmSync(logsDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    resetBoardDirCache();
    // Clear temp dir contents
    if (fs.existsSync(tempDir)) {
      for (const file of fs.readdirSync(tempDir)) {
        fs.rmSync(path.join(tempDir, file), { force: true });
      }
    }
    // Reset mocks
    vi.mocked(taskRunner.start).mockReset().mockResolvedValue(undefined);
    vi.mocked(taskRunner.stop).mockReset().mockResolvedValue(undefined);

    app = createHttpApp();
  });

  // --- Profiles ---

  describe("GET /api/v1/profiles", () => {
    it("returns array of profiles", async () => {
      const res = await request(app).get("/api/v1/profiles");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(4);
    });

    it("each profile has expected fields", async () => {
      const res = await request(app).get("/api/v1/profiles");

      for (const profile of res.body) {
        expect(profile.id).toBeDefined();
        expect(profile.name).toBeDefined();
        expect(profile.description).toBeDefined();
        expect(profile.icon).toBeDefined();
        expect(profile.phase_models).toBeDefined();
        expect(profile.phase_thinking).toBeDefined();
      }
    });

    it("includes the auto profile", async () => {
      const res = await request(app).get("/api/v1/profiles");

      const auto = res.body.find((p: any) => p.id === "auto");
      expect(auto).toBeDefined();
      expect(auto.name).toBe("Auto (Optimized)");
    });
  });

  // --- Logs ---

  describe("GET /api/v1/projects/:slug/tasks/:taskId/logs", () => {
    it("returns empty lines array for task with no logs", async () => {
      store.createProject({ name: "Log Project" });
      store.createEpic("log-project", "Epic");
      store.createTask("log-project", 1, "Task");

      const res = await request(app).get(
        "/api/v1/projects/log-project/tasks/2/logs"
      );

      expect(res.status).toBe(200);
      expect(res.body.lines).toEqual([]);
    });

    it("returns log lines when logs exist", async () => {
      store.createProject({ name: "Log Lines Project" });
      store.createEpic("log-lines-project", "Epic");
      store.createTask("log-lines-project", 1, "Task");

      // Write log lines directly to the filesystem
      const logDir = path.join(
        logsDir,
        "log-lines-project",
        "task-2"
      );
      fs.mkdirSync(logDir, { recursive: true });
      fs.writeFileSync(
        path.join(logDir, "execution.log"),
        "Line 1\nLine 2\nLine 3\n"
      );

      const res = await request(app).get(
        "/api/v1/projects/log-lines-project/tasks/2/logs"
      );

      expect(res.status).toBe(200);
      expect(res.body.lines).toEqual(["Line 1", "Line 2", "Line 3"]);
    });

    it("respects the tail query parameter", async () => {
      store.createProject({ name: "Log Tail Project" });
      store.createEpic("log-tail-project", "Epic");
      store.createTask("log-tail-project", 1, "Task");

      const logDir = path.join(
        logsDir,
        "log-tail-project",
        "task-2"
      );
      fs.mkdirSync(logDir, { recursive: true });
      const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`);
      fs.writeFileSync(path.join(logDir, "execution.log"), lines.join("\n") + "\n");

      const res = await request(app)
        .get("/api/v1/projects/log-tail-project/tasks/2/logs")
        .query({ tail: 5 });

      expect(res.status).toBe(200);
      expect(res.body.lines).toHaveLength(5);
      expect(res.body.lines[0]).toBe("Line 16");
      expect(res.body.lines[4]).toBe("Line 20");
    });
  });

  // --- Execute ---

  describe("POST /api/v1/projects/:slug/tasks/:taskId/execute", () => {
    it("calls taskRunner.start and returns ok", async () => {
      store.createProject({ name: "Exec Project" });
      store.createEpic("exec-project", "Epic");
      store.createTask("exec-project", 1, "Task", "Do the thing");

      const res = await request(app)
        .post("/api/v1/projects/exec-project/tasks/2/execute")
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(taskRunner.start).toHaveBeenCalledTimes(1);

      const startArg = vi.mocked(taskRunner.start).mock.calls[0][0];
      expect(startArg.slug).toBe("exec-project");
      expect(startArg.taskId).toBe(2);
      expect(startArg.description).toBe("Do the thing");
    });

    it("passes agent_profile to taskRunner.start", async () => {
      store.createProject({ name: "Exec Profile" });
      store.createEpic("exec-profile", "Epic");
      store.createTask("exec-profile", 1, "Task", "Description");

      await request(app)
        .post("/api/v1/projects/exec-profile/tasks/2/execute")
        .send({ agent_profile: "complex" });

      const startArg = vi.mocked(taskRunner.start).mock.calls[0][0];
      expect(startArg.agentProfile).toBe("complex");
    });

    it("returns 404 for non-existent project", async () => {
      const res = await request(app)
        .post("/api/v1/projects/non-existent/tasks/1/execute")
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Project not found");
    });

    it("returns 404 for non-existent task", async () => {
      store.createProject({ name: "Exec No Task" });

      const res = await request(app)
        .post("/api/v1/projects/exec-no-task/tasks/999/execute")
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Task not found");
    });

    it("returns 400 when taskRunner.start throws", async () => {
      store.createProject({ name: "Exec Error" });
      store.createEpic("exec-error", "Epic");
      store.createTask("exec-error", 1, "Task");

      vi.mocked(taskRunner.start).mockRejectedValueOnce(
        new Error("Task 2 is already running")
      );

      const res = await request(app)
        .post("/api/v1/projects/exec-error/tasks/2/execute")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("already running");
    });

    it("uses task title when description is absent", async () => {
      store.createProject({ name: "Exec Title" });
      store.createEpic("exec-title", "Epic");
      store.createTask("exec-title", 1, "My Task Title");

      await request(app)
        .post("/api/v1/projects/exec-title/tasks/2/execute")
        .send({});

      const startArg = vi.mocked(taskRunner.start).mock.calls[0][0];
      expect(startArg.description).toBe("My Task Title");
    });
  });

  // --- Stop ---

  describe("POST /api/v1/projects/:slug/tasks/:taskId/stop", () => {
    it("calls taskRunner.stop and returns ok", async () => {
      store.createProject({ name: "Stop Project" });
      store.createEpic("stop-project", "Epic");
      store.createTask("stop-project", 1, "Task");

      const res = await request(app)
        .post("/api/v1/projects/stop-project/tasks/2/stop")
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(taskRunner.stop).toHaveBeenCalledWith("stop-project", 2);
    });

    it("returns 400 when taskRunner.stop throws", async () => {
      vi.mocked(taskRunner.stop).mockRejectedValueOnce(
        new Error("Stop failed")
      );

      const res = await request(app)
        .post("/api/v1/projects/some-project/tasks/1/stop")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Stop failed");
    });
  });
});
