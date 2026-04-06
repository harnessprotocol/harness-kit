import Anthropic from '@anthropic-ai/sdk';
import { execFileSync } from 'node:child_process';
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

// ─── Auth ─────────────────────────────────────────────────────────────────────

interface ClaudeCredentials {
  accessToken: string;
  expiresAt: number;
}

/** Read the Claude Code OAuth token from the macOS keychain. */
function readKeychainToken(): ClaudeCredentials | null {
  if (process.platform !== 'darwin') return null;
  for (const service of ['Claude Code-credentials', 'Claude Code-credentials-518fa12f']) {
    try {
      const raw = execFileSync('security', [
        'find-generic-password', '-s', service, '-w',
      ], { timeout: 5000 }).toString().trim();

      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const oauth = parsed.claudeAiOauth as Record<string, unknown> | undefined;
      if (oauth?.accessToken && typeof oauth.accessToken === 'string') {
        return {
          accessToken: oauth.accessToken,
          expiresAt: typeof oauth.expiresAt === 'number' ? oauth.expiresAt : Infinity,
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}

function buildClient(): Anthropic {
  // Prefer explicit API key
  if (process.env.ANTHROPIC_API_KEY) {
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  // Fall back to Claude Code's stored OAuth token
  const creds = readKeychainToken();
  if (creds) {
    // expiresAt may be in ms (JS standard) or seconds (OAuth standard) — normalise to ms
    const expiresAtMs = creds.expiresAt > 1e12 ? creds.expiresAt : creds.expiresAt * 1000;
    if (expiresAtMs < Date.now()) {
      throw new Error('Claude Code OAuth token has expired. Re-authenticate with: claude /login');
    }
    return new Anthropic({ authToken: creds.accessToken });
  }
  throw new Error(
    'No Anthropic credentials found. Either set ANTHROPIC_API_KEY or authenticate Claude Code.'
  );
}

// ─── Generator ────────────────────────────────────────────────────────────────

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
        ? epic.tasks.map(t =>
            `      - [${t.status}] ${t.title}${t.description ? ': ' + t.description.slice(0, 120) : ''}`
          ).join('\n')
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

  let roadmapJson: Roadmap;
  try {
    const client = buildClient();

    const message = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 8192,
      system: `You are a product strategist. Generate a comprehensive product roadmap as a JSON object.
CRITICAL: Respond with ONLY a valid JSON object. No explanation, no markdown fences, no text before or after. Pure JSON only.`,
      messages: [{
        role: 'user',
        content: `Generate a strategic product roadmap for this project.

${projectContext}

Return a JSON object with this exact structure (use real UUIDs for all id fields):
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
- Base the roadmap on the existing tasks/epics context above`,
      }],
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      onEvent({ type: 'error', message: 'Unexpected response type from Claude' });
      return;
    }

    const rawText = content.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
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
