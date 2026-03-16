const MAX_SLUG_LEN = 40;

/**
 * Derive a git branch name for a task.
 * Convention: board/task-{id}-{slug}
 * e.g. "board/task-3-fix-auth-middleware"
 */
export function taskBranchName(taskId: number, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_SLUG_LEN);
  return `board/task-${taskId}-${slug}`;
}

/**
 * Derive a worktree directory name for a task.
 * Placed sibling to the repo root: ../{repo-name}-board-{taskId}
 */
export function taskWorktreeName(taskId: number): string {
  return `board-${taskId}`;
}
