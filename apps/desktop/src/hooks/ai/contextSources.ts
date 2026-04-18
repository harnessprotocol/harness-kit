import { readHarnessFile, readClaudeMd, aiListSessions } from '../../lib/tauri';
import { api } from '../../lib/board-api';

export interface ContextFragment {
  source: string;
  text: string;
}

export type ContextSourceKey =
  | 'harness.yaml'
  | 'board'
  | 'route'
  | 'recent-sessions'
  | 'claude.md';

export async function harnessYamlFragment(): Promise<ContextFragment> {
  try {
    const result = await readHarnessFile();
    if (!result.found || !result.content) {
      return { source: 'harness.yaml', text: '(no harness.yaml found)' };
    }
    const lines = result.content.split('\n');
    const preview = lines.slice(0, 40).join('\n');
    const suffix = lines.length > 40 ? `\n... (${lines.length - 40} more lines)` : '';
    return {
      source: 'harness.yaml',
      text: `Current harness.yaml (${result.path ?? 'unknown path'}):\n\`\`\`yaml\n${preview}${suffix}\n\`\`\``,
    };
  } catch {
    return { source: 'harness.yaml', text: '(could not read harness.yaml)' };
  }
}

export async function activeBoardProjectFragment(): Promise<ContextFragment> {
  try {
    const projects = await api.projects.list();
    if (projects.length === 0) {
      return { source: 'board', text: '(no board projects found)' };
    }

    const lines: string[] = [`Board projects (${projects.length} total):`];
    for (const project of projects.slice(0, 3)) {
      const tasks = await api.tasks.list(project.slug, { status: 'in_progress' }).catch(() => []);
      const inFlight = tasks.slice(0, 5);
      lines.push(`\n**${project.name}** (${project.slug})`);
      if (project.description) lines.push(`  ${project.description}`);
      if (inFlight.length > 0) {
        lines.push(`  In-progress tasks:`);
        for (const t of inFlight) {
          lines.push(`    - [${t.id}] ${t.title} (${t.priority ?? 'normal'})`);
        }
      }
    }

    return { source: 'board', text: lines.join('\n') };
  } catch {
    return { source: 'board', text: '(board server not reachable)' };
  }
}

export function currentRouteFragment(pathname: string): ContextFragment {
  const routeLabels: Record<string, string> = {
    '/ai-chat': 'AI Chat',
    '/board': 'Kanban Board',
    '/harness': 'Harness Config',
    '/plugins': 'Plugins',
    '/security': 'Security',
    '/observatory': 'Observatory',
    '/memory': 'Memory',
    '/sync': 'Sync',
    '/settings': 'Settings',
    '/comparator': 'Comparator',
    '/roadmap': 'Roadmap',
  };

  const label = Object.entries(routeLabels).find(([k]) => pathname.startsWith(k))?.[1]
    ?? pathname;

  return {
    source: 'route',
    text: `Current view: ${label} (${pathname})`,
  };
}

export async function recentSessionsFragment(): Promise<ContextFragment> {
  try {
    const sessions = await aiListSessions();
    const recent = sessions
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 5);

    if (recent.length === 0) {
      return { source: 'recent-sessions', text: '(no prior AI chat sessions)' };
    }

    const lines = ['Recent AI chat sessions:'];
    for (const s of recent) {
      const title = s.title ?? '(untitled)';
      const model = s.model ?? 'unknown';
      lines.push(`  - ${title} [${model}]`);
    }
    return { source: 'recent-sessions', text: lines.join('\n') };
  } catch {
    return { source: 'recent-sessions', text: '(could not load session history)' };
  }
}

export async function claudeMdFragment(): Promise<ContextFragment> {
  try {
    const content = await readClaudeMd('CLAUDE.md');
    const lines = content.split('\n');
    const preview = lines.slice(0, 50).join('\n');
    const suffix = lines.length > 50 ? `\n... (${lines.length - 50} more lines)` : '';
    return {
      source: 'claude.md',
      text: `CLAUDE.md:\n\`\`\`\n${preview}${suffix}\n\`\`\``,
    };
  } catch {
    return { source: 'claude.md', text: '(no CLAUDE.md found)' };
  }
}

export async function buildSystemPrompt(
  enabled: Set<ContextSourceKey>,
  pathname: string,
): Promise<string> {
  const fetchers: Array<[ContextSourceKey, () => Promise<ContextFragment> | ContextFragment]> = [
    ['harness.yaml', harnessYamlFragment],
    ['board', activeBoardProjectFragment],
    ['route', () => currentRouteFragment(pathname)],
    ['recent-sessions', recentSessionsFragment],
    ['claude.md', claudeMdFragment],
  ];

  const active = fetchers.filter(([key]) => enabled.has(key));
  const frags = await Promise.all(active.map(([, fn]) => fn()));
  return frags.map((f) => f.text).join('\n\n');
}
