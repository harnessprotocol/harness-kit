import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type WorktreeInfo = {
  path: string;
  branch: string | null;
  head: string | null;
};

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

/**
 * Create a git worktree at worktreePath on a new branch.
 * If the worktree path already exists (prior run), returns it as-is.
 * Returns the absolute worktreePath.
 */
export function createWorktree(repoPath: string, branchName: string, worktreePath: string): string {
  const absRepo = path.resolve(repoPath);
  const absWorktree = path.resolve(worktreePath);

  if (fs.existsSync(absWorktree)) {
    return absWorktree;
  }

  // Check if the branch already exists
  const branches = git(["branch", "--list"], absRepo);
  const branchExists = branches
    .split("\n")
    .some((b) => b.trim().replace(/^\* /, "") === branchName);

  if (branchExists) {
    git(["worktree", "add", absWorktree, branchName], absRepo);
  } else {
    git(["worktree", "add", "-b", branchName, absWorktree], absRepo);
  }

  return absWorktree;
}

/**
 * Remove a worktree. Does NOT delete the branch.
 * Call site is responsible for prompting the user before removing.
 */
export function removeWorktree(repoPath: string, worktreePath: string): void {
  const absRepo = path.resolve(repoPath);
  const absWorktree = path.resolve(worktreePath);
  git(["worktree", "remove", absWorktree], absRepo);
}

/**
 * List all worktrees for a repo.
 */
export function listWorktrees(repoPath: string): WorktreeInfo[] {
  const absRepo = path.resolve(repoPath);
  try {
    const output = git(["worktree", "list", "--porcelain"], absRepo);
    const results: WorktreeInfo[] = [];
    let current: Partial<WorktreeInfo> = {};
    for (const line of output.split("\n")) {
      if (line.startsWith("worktree ")) {
        if (current.path) results.push(current as WorktreeInfo);
        current = { path: line.slice("worktree ".length), branch: null, head: null };
      } else if (line.startsWith("HEAD ")) {
        current.head = line.slice("HEAD ".length);
      } else if (line.startsWith("branch ")) {
        current.branch = line.slice("branch ".length).replace("refs/heads/", "");
      }
    }
    if (current.path) results.push(current as WorktreeInfo);
    return results;
  } catch {
    return [];
  }
}

/**
 * Return true if the given directory is a git repository.
 */
export function isGitRepo(dirPath: string): boolean {
  try {
    git(["rev-parse", "--git-dir"], path.resolve(dirPath));
    return true;
  } catch {
    return false;
  }
}
