import { Command } from '@tauri-apps/plugin-shell';

interface TaskLike {
  id: number;
  title: string;
  description?: string;
  worktree_path?: string;
}

export async function openInClaudeCode(task: TaskLike) {
  const args: string[] = [];
  if (task.worktree_path) {
    args.push('--cwd', task.worktree_path);
  }
  args.push('--resume', `Work on board task #${task.id}: ${task.title}`);
  const cmd = Command.create('claude', args);
  await cmd.spawn();
}
