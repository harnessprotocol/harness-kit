import Anthropic from '@anthropic-ai/sdk';
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

export async function generateRoadmap(
  slug: string,
  onEvent: (event: RoadmapGeneratorEvent) => void,
): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    onEvent({ type: 'error', message: 'ANTHROPIC_API_KEY is not set. Set it in the board server environment.' });
    return;
  }

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

    projectContext = `Project: ${project.name || slug}\nEpics and tasks (${taskCount} total):\n\n${epicsText}`;
  } catch (err) {
    onEvent({ type: 'error', message: `Failed to read project: ${err instanceof Error ? err.message : String(err)}` });
    return;
  }

  // Phase 2: Generate with Claude
  onEvent({ type: 'phase', phase: 'generating', label: 'Generating roadmap with Claude...' });

  const client = new Anthropic({ apiKey });

  const systemPrompt = `You are a product strategist. Generate a comprehensive product roadmap as a JSON object.
CRITICAL: Respond with ONLY a valid JSON object. No explanation, no markdown fences, no text before or after. Pure JSON only.`;

  const userPrompt = `Generate a strategic product roadmap for this project.

${projectContext}

Return a JSON object with this exact structure (use real UUIDs for all id fields):
{
  "version": "1.0",
  "projectName": "<project name>",
  "vision": "<1-2 sentence product vision>",
  "status": "active",
  "targetAudience": {
    "primary": "<primary user persona>",
    "secondary": ["<secondary persona 1>", "<secondary persona 2>"],
    "painPoints": ["<pain point 1>", "<pain point 2>", "<pain point 3>"],
    "goals": ["<goal 1>", "<goal 2>", "<goal 3>"],
    "usageContext": "<when/how they use it>"
  },
  "phases": [
    {
      "id": "<uuid>",
      "name": "<phase name>",
      "description": "<phase goal>",
      "order": 1,
      "status": "planned",
      "features": ["<feature-id-1>", "<feature-id-2>"],
      "milestones": [
        {
          "id": "<uuid>",
          "title": "<milestone title>",
          "description": "<milestone description>",
          "features": ["<feature-id>"],
          "status": "planned"
        }
      ]
    }
  ],
  "features": [
    {
      "id": "<uuid>",
      "title": "<feature title>",
      "description": "<feature description>",
      "rationale": "<why this feature matters>",
      "priority": "must",
      "complexity": "medium",
      "impact": "high",
      "phaseId": "<phase-uuid>",
      "status": "backlog",
      "dependencies": [],
      "acceptanceCriteria": ["<criterion 1>", "<criterion 2>"],
      "userStories": ["As a <persona>, I want to <action> so that <benefit>."],
      "competitorInsightIds": []
    }
  ]
}

Requirements:
- 3-4 phases ordered logically (foundation → growth → scale → etc.)
- 10-15 features total across all phases
- Mix priorities: must (40%), should (35%), could (20%), wont (5%)
- Each feature has 2-3 user stories and 2-3 acceptance criteria
- phase.features array must contain the ids of features assigned to that phase
- All ids must be valid UUIDs (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx format)
- Base the roadmap on the existing tasks/epics — extend and improve, don't just restate them`;

  let roadmapJson: Roadmap;
  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 8192,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      onEvent({ type: 'error', message: 'Unexpected response type from Claude' });
      return;
    }

    // Strip any accidental markdown fences
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
