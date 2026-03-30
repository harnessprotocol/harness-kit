import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const LOGS_DIR = path.join(os.homedir(), '.harness', 'board', 'logs');

function logDir(slug: string, taskId: number): string {
  return path.join(LOGS_DIR, slug, `task-${taskId}`);
}

function ensureLogDir(slug: string, taskId: number): void {
  fs.mkdirSync(logDir(slug, taskId), { recursive: true });
}

export function appendLog(slug: string, taskId: number, line: string, structured?: Record<string, unknown>): void {
  ensureLogDir(slug, taskId);
  const dir = logDir(slug, taskId);
  const ts = new Date().toISOString();
  fs.appendFileSync(path.join(dir, 'execution.log'), line + '\n');
  if (structured !== undefined) {
    fs.appendFileSync(path.join(dir, 'execution.jsonl'), JSON.stringify({ ts, ...structured, message: line }) + '\n');
  }
}

export function readTail(slug: string, taskId: number, lines: number = 100): string[] {
  const logPath = path.join(logDir(slug, taskId), 'execution.log');
  if (!fs.existsSync(logPath)) return [];
  const content = fs.readFileSync(logPath, 'utf8');
  return content.split('\n').filter(Boolean).slice(-lines);
}

export function readAllLogs(slug: string, taskId: number): string[] {
  const logPath = path.join(logDir(slug, taskId), 'execution.log');
  if (!fs.existsSync(logPath)) return [];
  return fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
}

export function clearLogs(slug: string, taskId: number): void {
  const dir = logDir(slug, taskId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true });
  }
}

export function watchLogs(slug: string, taskId: number, onLine: (line: string) => void): () => void {
  ensureLogDir(slug, taskId);
  const logPath = path.join(logDir(slug, taskId), 'execution.log');
  let lastSize = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;

  const watcher = fs.watch(logPath, { persistent: false }, () => {
    try {
      const stat = fs.statSync(logPath);
      if (stat.size > lastSize) {
        const fd = fs.openSync(logPath, 'r');
        const buf = Buffer.alloc(stat.size - lastSize);
        fs.readSync(fd, buf, 0, buf.length, lastSize);
        fs.closeSync(fd);
        lastSize = stat.size;
        buf.toString().split('\n').filter(Boolean).forEach(onLine);
      }
    } catch { /* file may not exist yet */ }
  });

  return () => watcher.close();
}
