// packages/agent-server/src/tools/fs-tools.ts
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve as pathResolve } from 'node:path';

// ── Path safety ───────────────────────────────────────────────────────────────

/**
 * Resolve a path and verify it stays within `workDir`.
 * Returns the absolute path if safe, or null if it escapes the worktree.
 */
function resolveSafe(workDir: string, inputPath: string): string | null {
  const abs = pathResolve(workDir, inputPath);
  const normalWorkDir = pathResolve(workDir);
  if (abs !== normalWorkDir && !abs.startsWith(normalWorkDir + '/')) return null;
  return abs;
}

// ── Bash allowlist ────────────────────────────────────────────────────────────
// Only allow known-safe base commands. This is an allowlist, not a denylist,
// so unknown commands fail closed. Pipes/redirects are permitted as long as
// the first command token is on this list.

const ALLOWED_BASE_COMMANDS = new Set([
  // Version control
  'git',
  // Node / JS
  'node', 'npm', 'npx', 'pnpm', 'yarn', 'bun', 'tsx', 'tsc',
  // Python
  'python', 'python3', 'pip', 'pip3', 'uv', 'poetry',
  // Rust / Go / other compiled
  'cargo', 'rustc', 'go',
  // Linters / formatters / test runners
  'eslint', 'prettier', 'vitest', 'jest', 'mocha', 'pytest',
  // POSIX coreutils (read-oriented)
  'cat', 'ls', 'echo', 'pwd', 'env', 'which', 'type',
  'head', 'tail', 'wc', 'diff', 'sort', 'uniq', 'stat', 'file',
  // Text processing
  'grep', 'find', 'sed', 'awk', 'cut', 'tr', 'xargs', 'jq', 'yq',
  // File operations (within workDir, enforced by cwd option)
  'mkdir', 'touch', 'cp', 'mv', 'rm', 'chmod',
  // Archives
  'zip', 'unzip', 'tar',
  // Build tools
  'make', 'cmake',
  // Network (intentionally kept: agents may need to fetch deps)
  'curl', 'wget',
]);

/**
 * Returns true if the command is permitted to run.
 * Extracts the first command token and checks it against the allowlist.
 * `sudo` is never permitted regardless of the first token.
 */
export function validateBashCommand(cmd: string): boolean {
  const trimmed = cmd.trim();
  if (!trimmed) return false;
  if (/\bsudo\b/.test(trimmed)) return false;
  const firstToken = trimmed.split(/\s+/)[0];
  const basename = firstToken.split('/').pop() ?? firstToken;
  if (!ALLOWED_BASE_COMMANDS.has(basename)) return false;
  // Block pipe-into-interpreter (download-and-execute attack vector)
  if (/\|\s*(bash|sh|zsh|fish|node|python3?|ruby|perl)\b/.test(trimmed)) return false;
  // Block rm/rmdir targeting any absolute path (/) or home-relative path (~/).
  // Agents must use relative paths within the worktree; absolute paths have no safe
  // use case here and create an unbounded destructive surface.
  if ((basename === 'rm' || basename === 'rmdir') && /\s[\/~]/.test(trimmed)) return false;
  return true;
}

// ── Tool factory ──────────────────────────────────────────────────────────────

export function buildFsTools(workDir: string, allowedTools?: string[]) {
  const allowed = (name: string) =>
    !allowedTools || allowedTools.includes(name);

  const tools = [];

  if (allowed('read_file')) {
    tools.push(tool(
      ({ path }: { path: string }) => {
        const abs = resolveSafe(workDir, path);
        if (!abs) return `Error: path "${path}" is outside the worktree.`;
        try { return readFileSync(abs, 'utf8'); }
        catch (e) { return `Error reading file: ${e}`; }
      },
      { name: 'read_file', description: 'Read a file within the worktree', schema: z.object({ path: z.string() }) }
    ));
  }

  if (allowed('write_file')) {
    tools.push(tool(
      ({ path, content }: { path: string; content: string }) => {
        const abs = resolveSafe(workDir, path);
        if (!abs) return `Error: path "${path}" is outside the worktree.`;
        try {
          writeFileSync(abs, content, 'utf8');
          return `File ${path} written successfully.`;
        } catch (e) { return `Error writing file: ${e}`; }
      },
      { name: 'write_file', description: 'Write content to a file within the worktree',
        schema: z.object({ path: z.string(), content: z.string() }) }
    ));
  }

  if (allowed('edit_file')) {
    tools.push(tool(
      ({ path, old_str, new_str }: { path: string; old_str: string; new_str: string }) => {
        const abs = resolveSafe(workDir, path);
        if (!abs) return `Error: path "${path}" is outside the worktree.`;
        try {
          const content = readFileSync(abs, 'utf8');
          if (!content.includes(old_str)) return `Error: old_str not found in ${path}`;
          const count = content.split(old_str).length - 1;
          if (count > 1) return `Error: old_str matches ${count} times in ${path} — provide more context to uniquely identify the target.`;
          writeFileSync(abs, content.replace(old_str, new_str), 'utf8');
          return `File ${path} updated successfully.`;
        } catch (e) { return `Error editing file: ${e}`; }
      },
      { name: 'edit_file', description: 'Edit a file by replacing a unique string',
        schema: z.object({ path: z.string(), old_str: z.string(), new_str: z.string() }) }
    ));
  }

  if (allowed('list_directory')) {
    tools.push(tool(
      ({ path }: { path: string }) => {
        const abs = resolveSafe(workDir, path);
        if (!abs) return `Error: path "${path}" is outside the worktree.`;
        try { return readdirSync(abs).join('\n'); }
        catch (e) { return `Error listing directory: ${e}`; }
      },
      { name: 'list_directory', description: 'List directory contents within the worktree',
        schema: z.object({ path: z.string() }) }
    ));
  }

  if (allowed('bash')) {
    tools.push(tool(
      ({ command }: { command: string }) => {
        if (!validateBashCommand(command)) {
          return `Error: command blocked by security policy. Only known dev tools are permitted (git, npm, pnpm, node, tsc, vitest, etc.).`;
        }
        try {
          return execSync(command, { cwd: workDir, timeout: 30000, encoding: 'utf8' });
        } catch (e: unknown) {
          return `Exit ${(e as NodeJS.ErrnoException & { status?: number }).status ?? 1}:\n${(e as Error).message}`;
        }
      },
      { name: 'bash', description: 'Run a shell command in the worktree (git, npm, tsc, vitest, etc.)',
        schema: z.object({ command: z.string() }) }
    ));
  }

  return tools;
}
