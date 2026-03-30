import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import * as logStore from "../src/store/log-store.js";

describe("log-store", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "board-log-test-"));
    process.env.NODE_ENV = "test";
    process.env.BOARD_TEST_LOG_DIR = testDir;
  });

  afterEach(() => {
    delete process.env.BOARD_TEST_LOG_DIR;
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  function logFilePath(slug: string, taskId: number, file: string): string {
    return path.join(testDir, slug, `task-${taskId}`, file);
  }

  function taskLogDir(slug: string, taskId: number): string {
    return path.join(testDir, slug, `task-${taskId}`);
  }

  describe("appendLog", () => {
    it("creates log file and appends a line", () => {
      logStore.appendLog("test-proj", 1, "Hello log line");

      const lp = logFilePath("test-proj", 1, "execution.log");
      expect(fs.existsSync(lp)).toBe(true);

      const content = fs.readFileSync(lp, "utf-8");
      expect(content.trim()).toBe("Hello log line");
    });

    it("appends multiple lines", () => {
      logStore.appendLog("test-proj", 2, "Line 1");
      logStore.appendLog("test-proj", 2, "Line 2");
      logStore.appendLog("test-proj", 2, "Line 3");

      const lp = logFilePath("test-proj", 2, "execution.log");
      const lines = fs
        .readFileSync(lp, "utf-8")
        .split("\n")
        .filter(Boolean);
      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe("Line 1");
      expect(lines[1]).toBe("Line 2");
      expect(lines[2]).toBe("Line 3");
    });

    it("writes structured JSONL when structured param is provided", () => {
      logStore.appendLog("test-proj", 3, "Structured line", {
        phase: "coding",
        progress: 50,
      });

      const jsonlPath = logFilePath("test-proj", 3, "execution.jsonl");
      expect(fs.existsSync(jsonlPath)).toBe(true);

      const raw = fs.readFileSync(jsonlPath, "utf-8").trim();
      const parsed = JSON.parse(raw);
      expect(parsed.message).toBe("Structured line");
      expect(parsed.phase).toBe("coding");
      expect(parsed.progress).toBe(50);
      expect(parsed.ts).toBeDefined();
    });

    it("does not write JSONL when structured param is omitted", () => {
      logStore.appendLog("test-proj", 4, "Plain line");

      const jsonlPath = logFilePath("test-proj", 4, "execution.jsonl");
      expect(fs.existsSync(jsonlPath)).toBe(false);
    });

    it("creates nested directories for project and task", () => {
      logStore.appendLog("deep-project", 42, "Deep log");

      const dir = taskLogDir("deep-project", 42);
      expect(fs.existsSync(dir)).toBe(true);
    });
  });

  describe("readTail", () => {
    it("returns last N lines", () => {
      for (let i = 1; i <= 10; i++) {
        logStore.appendLog("test-proj", 5, `Line ${i}`);
      }

      const tail = logStore.readTail("test-proj", 5, 3);
      expect(tail).toHaveLength(3);
      expect(tail[0]).toBe("Line 8");
      expect(tail[1]).toBe("Line 9");
      expect(tail[2]).toBe("Line 10");
    });

    it("returns all lines when N exceeds total lines", () => {
      logStore.appendLog("test-proj", 6, "Only line");

      const tail = logStore.readTail("test-proj", 6, 100);
      expect(tail).toHaveLength(1);
      expect(tail[0]).toBe("Only line");
    });

    it("returns empty array when no log file exists", () => {
      const tail = logStore.readTail("non-existent-proj", 999, 50);
      expect(tail).toEqual([]);
    });

    it("defaults to 100 lines", () => {
      for (let i = 1; i <= 150; i++) {
        logStore.appendLog("test-proj", 7, `Line ${i}`);
      }

      const tail = logStore.readTail("test-proj", 7);
      expect(tail).toHaveLength(100);
      expect(tail[0]).toBe("Line 51");
      expect(tail[99]).toBe("Line 150");
    });
  });

  describe("readAllLogs", () => {
    it("returns all log lines", () => {
      logStore.appendLog("test-proj", 8, "A");
      logStore.appendLog("test-proj", 8, "B");
      logStore.appendLog("test-proj", 8, "C");

      const all = logStore.readAllLogs("test-proj", 8);
      expect(all).toEqual(["A", "B", "C"]);
    });

    it("returns empty array when no log file exists", () => {
      const all = logStore.readAllLogs("missing", 1);
      expect(all).toEqual([]);
    });
  });

  describe("clearLogs", () => {
    it("removes the log directory for a task", () => {
      logStore.appendLog("test-proj", 9, "To be cleared");
      const dir = taskLogDir("test-proj", 9);
      expect(fs.existsSync(dir)).toBe(true);

      logStore.clearLogs("test-proj", 9);
      expect(fs.existsSync(dir)).toBe(false);
    });

    it("does not throw when clearing non-existent logs", () => {
      expect(() => {
        logStore.clearLogs("non-existent", 1);
      }).not.toThrow();
    });
  });
});
