import { execFile, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as store from '../store/yaml-store.js';
import * as roadmapStore from '../store/roadmap-store.js';
import type { Roadmap } from '../roadmap-types.js';

export type GeneratePhase = 'analyzing' | 'generating' | 'saving' | 'done';

export interface GenerateEvent {
  type: 'phase';
  phase: GeneratePhase;
  label: string;
}

export interface DoneEvent {
  type: 'done';
}

export interface ErrorEvent {
  type: 'error';
  message: string;
}

export type RoadmapGeneratorEvent = GenerateEvent | DoneEvent | ErrorEvent;

let _claudePath: string | null = null;
function findClaude(): string {
  if (process.env.CLAUDE_PATH) return process.env.CLAUDE_PATH;
  if (_claudePath) return _claudePath;
  // Try common install locations, then fall back to PATH lookup
  const candidates = [
    `${process.env.HOME}/.local/bin/claude`,
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
  ];
  for (const p of candidates) {
    try {
      execFileSync('test', ['-x', p]);
      _claudePath = p;
      return p;
    } catch { /* not found */ }
  }
  // Last resort: resolve via `which`
  try {
    _claudePath = execFileSync('which', ['claude'], { env: { ...process.env, PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env.HOME}/.local/bin:${process.env.PATH}` } }).toString().trim();
    return _claudePath;
  } catch {
    throw new Error('claude CLI not found. Install Claude Code: https://claude.ai/code');
  }
}

function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const claude = findClaude();
    const child = execFile(
      claude,
      ['-p', '--output-format', 'json', '--model', 'claude-opus-4-6'],
      { maxBuffer: 16 * 1024 * 1024, timeout: 180_000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        try {
          const parsed = JSON.parse(stdout) as { result?: string };
          resolve(parsed.result ?? stdout);
        } catch {
          resolve(stdout);
        }
      },
    );
    child.stdin?.write(prompt);
    child.stdin?.end();
  });
}

export async function generateRoadmap(
  slug: string,
  onEvent: (event: RoadmapGeneratorEvent) => void,
): Promise<void> {
  // Phase 1: Analyze project
  onEvent({ type: 'phase', phase: 'analyzing', label: 'Reading project data...' });

  let projectContext: string;
  try {
    const project = store.readProject(slug);
    if (!project) {
      onEvent({ type: 'error', message: `Project "${slug}" not found` });
      return;
    }

    const taskCount = project.epics.reduce((n, e) => n + e.tasks.length, 0);
    const epicsText = project.epics.map(epic => {
      const tasksText = epic.tasks.length > 0
        ? epic.tasks.map(t => `      - [${t.status}] ${t.title}${t.description ? ': ' + t.description.slice(0, 120) : ''}`).join('\n')
        : '      (no tasks yet)';
      return `  Epic: ${epic.name}\n${tasksText}`;
    }).join('\n\n');

    projectContext = `Project: ${project.name || slug}\nEpics and tasks (${taskCount} total):\n\n${epicsText || '  (no epics or tasks yet)'}`;
  } catch (err) {
    onEvent({ type: 'error', message: `Failed to read project: ${err instanceof Error ? err.message : String(err)}` });
    return;
  }

  // Phase 2: Generate with Claude
  onEvent({ type: 'phase', phase: 'generating', label: 'Generating roadmap with Claude...' });

  const prompt = `Generate a strategic product roadmap for this project.

${projectContext}

Return ONLY a valid JSON object with this structure (use real UUIDs for all id fields):
{
  "version": "1.0",
  "projectName": "<project name>",
  "vision": "<1-2 sentence product vision>",
  "status": "active",
  "targetAudience": {
    "primary": "<primary user persona>",
    "secondary": ["<secondary persona>"],
    "painPoints": ["<pain point>", "<pain point>", "<pain point>"],
    "goals": ["<goal>", "<goal>", "<goal>"],
    "usageContext": "<when/how they use it>"
  },
  "phases": [
    {
      "id": "<uuid>",
      "name": "<phase name>",
      "description": "<phase goal>",
      "order": 1,
      "status": "planned",
      "features": ["<feature-id>"],
      "milestones": [{"id": "<uuid>", "title": "<title>", "description": "<desc>", "features": ["<feature-id>"], "status": "planned"}]
    }
  ],
  "features": [
    {
      "id": "<uuid>",
      "title": "<title>",
      "description": "<description>",
      "rationale": "<why this matters>",
      "priority": "must",
      "complexity": "medium",
      "impact": "high",
      "phaseId": "<phase-uuid>",
      "status": "backlog",
      "dependencies": [],
      "acceptanceCriteria": ["<criterion>", "<criterion>"],
      "userStories": ["As a <persona>, I want to <action> so that <benefit>."],
      "competitorInsightIds": []
    }
  ]
}

Requirements:
- 3-4 phases ordered logically (foundation → growth → scale etc.)
- 10-15 features total across all phases
- Mix priorities: ~40% must, ~35% should, ~20% could, ~5% wont
- Each feature needs 2-3 user stories and 2-3 acceptance criteria
- phase.features array must list the ids of features in that phase
- Base the roadmap on the existing tasks/epics context above
- Return ONLY the JSON object, no explanation, no markdown fences`;

  let roadmapJson: Roadmap;
  try {
    const result = await runClaude(prompt);
    const rawText = result.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const parsed = JSON.parse(rawText) as Record<string, unknown>;

    if (!parsed.version || !Array.isArray(parsed.phases) || !Array.isArray(parsed.features)) {
      onEvent({ type: 'error', message: 'Generated roadmap is missing required fields (version, phases, features)' });
      return;
    }

    const now = new Date().toISOString();
    roadmapJson = {
      ...(parsed as unknown as Roadmap),
      id: randomUUID(),
      projectSlug: slug,
      created_at: now,
      updated_at: now,
    };
  } catch (err) {
    onEvent({ type: 'error', message: `Generation failed: ${err instanceof Error ? err.message : String(err)}` });
    return;
  }

  // Phase 3: Save
  onEvent({ type: 'phase', phase: 'saving', label: 'Saving roadmap...' });

  try {
    roadmapStore.writeRoadmap(slug, roadmapJson);
  } catch (err) {
    onEvent({ type: 'error', message: `Failed to save roadmap: ${err instanceof Error ? err.message : String(err)}` });
    return;
  }

  onEvent({ type: 'done' });
}
