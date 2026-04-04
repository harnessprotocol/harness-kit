import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import * as roadmapStore from '../../store/roadmap-store.js';
import * as store from '../../store/yaml-store.js';
import type { RoadmapFeature, RoadmapFeatureStatus, RoadmapFeaturePriority } from '../../roadmap-types.js';

export const roadmapTools = [
  {
    name: 'get_roadmap',
    description: 'Get the roadmap for a project',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project slug' },
      },
      required: ['project'],
    },
    schema: z.object({
      project: z.string(),
    }),
    handler: async (args: { project: string }) => {
      const roadmap = roadmapStore.readRoadmap(args.project);
      if (!roadmap) {
        return { content: [{ type: 'text' as const, text: 'No roadmap found' }] };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(roadmap, null, 2) }] };
    },
  },
  {
    name: 'save_roadmap',
    description: 'Persist a roadmap for a project (Claude generates the roadmap object and calls this to save it)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project slug' },
        roadmap: { type: 'object', description: 'Roadmap object conforming to the Roadmap type' },
      },
      required: ['project', 'roadmap'],
    },
    schema: z.object({
      project: z.string(),
      roadmap: z.record(z.unknown()),
    }),
    handler: async (args: { project: string; roadmap: Record<string, unknown> }) => {
      const { roadmap: raw } = args;
      // Runtime validation: required fields
      if (!raw.id && !raw.projectSlug && !raw.version && !Array.isArray(raw.phases) && !Array.isArray(raw.features)) {
        // At least one of the key fields must be present; build a specific error if any are missing
      }
      const missingFields: string[] = [];
      if (!raw.version) missingFields.push('version');
      if (!Array.isArray(raw.phases)) missingFields.push('phases (array)');
      if (!Array.isArray(raw.features)) missingFields.push('features (array)');
      if (missingFields.length > 0) {
        return { content: [{ type: 'text' as const, text: `Invalid roadmap: missing required fields: ${missingFields.join(', ')}` }] };
      }
      const now = new Date().toISOString();
      const roadmap = {
        ...raw,
        projectSlug: args.project,
        updated_at: now,
        created_at: (raw.created_at as string | undefined) ?? now,
        id: (raw.id as string | undefined) ?? randomUUID(),
      };
      roadmapStore.writeRoadmap(args.project, roadmap as unknown as import('../../roadmap-types.js').Roadmap);
      return { content: [{ type: 'text' as const, text: `Roadmap saved for project "${args.project}"` }] };
    },
  },
  {
    name: 'get_competitor_analysis',
    description: 'Get the competitor analysis for a project',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project slug' },
      },
      required: ['project'],
    },
    schema: z.object({
      project: z.string(),
    }),
    handler: async (args: { project: string }) => {
      const analysis = roadmapStore.readCompetitorAnalysis(args.project);
      if (!analysis) {
        return { content: [{ type: 'text' as const, text: 'No competitor analysis found' }] };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(analysis, null, 2) }] };
    },
  },
  {
    name: 'save_competitor_analysis',
    description: 'Persist competitor analysis for a project',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project slug' },
        analysis: { type: 'object', description: 'CompetitorAnalysis object' },
      },
      required: ['project', 'analysis'],
    },
    schema: z.object({
      project: z.string(),
      analysis: z.record(z.unknown()),
    }),
    handler: async (args: { project: string; analysis: Record<string, unknown> }) => {
      const { analysis: raw } = args;
      if (!Array.isArray(raw.competitors)) {
        return { content: [{ type: 'text' as const, text: 'Invalid competitor analysis: missing required field: competitors (array)' }] };
      }
      const analysis = {
        ...raw,
        created_at: (raw.created_at as string | undefined) ?? new Date().toISOString(),
      };
      roadmapStore.writeCompetitorAnalysis(args.project, analysis as unknown as import('../../roadmap-types.js').CompetitorAnalysis);
      return { content: [{ type: 'text' as const, text: `Competitor analysis saved for project "${args.project}"` }] };
    },
  },
  {
    name: 'list_roadmap_features',
    description: 'List roadmap features, optionally filtered by status or priority',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project slug' },
        status: { type: 'string', enum: ['backlog', 'planning', 'in_progress', 'done'], description: 'Filter by status' },
        priority: { type: 'string', enum: ['must', 'should', 'could', 'wont'], description: 'Filter by priority' },
      },
      required: ['project'],
    },
    schema: z.object({
      project: z.string(),
      status: z.enum(['backlog', 'planning', 'in_progress', 'done']).optional(),
      priority: z.enum(['must', 'should', 'could', 'wont']).optional(),
    }),
    handler: async (args: { project: string; status?: RoadmapFeatureStatus; priority?: RoadmapFeaturePriority }) => {
      const roadmap = roadmapStore.readRoadmap(args.project);
      if (!roadmap) {
        return { content: [{ type: 'text' as const, text: 'No roadmap found' }] };
      }
      let features = roadmap.features;
      if (args.status) features = features.filter(f => f.status === args.status);
      if (args.priority) features = features.filter(f => f.priority === args.priority);
      if (features.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No features match the given filters' }] };
      }
      const lines = features.map(f =>
        `[${f.id}] ${f.title} | status: ${f.status} | priority: ${f.priority} | complexity: ${f.complexity} | impact: ${f.impact}${f.linkedTaskId ? ` | task: #${f.linkedTaskId}` : ''}`,
      );
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  },
  {
    name: 'add_roadmap_feature',
    description: 'Add a single feature to an existing roadmap',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project slug' },
        feature: { type: 'object', description: 'Feature object (title, description, rationale, priority, complexity, impact, phaseId, status, acceptanceCriteria, userStories are required)' },
      },
      required: ['project', 'feature'],
    },
    schema: z.object({
      project: z.string(),
      feature: z.record(z.unknown()),
    }),
    handler: async (args: { project: string; feature: Record<string, unknown> }) => {
      const roadmap = roadmapStore.readRoadmap(args.project);
      if (!roadmap) {
        return { content: [{ type: 'text' as const, text: 'No roadmap found — create one first with save_roadmap' }] };
      }
      const feature = {
        dependencies: [],
        acceptanceCriteria: [],
        userStories: [],
        competitorInsightIds: [],
        ...(args.feature as Partial<RoadmapFeature>),
        id: randomUUID(),
      } as RoadmapFeature;
      roadmap.features.push(feature);
      roadmap.updated_at = new Date().toISOString();
      roadmapStore.writeRoadmap(args.project, roadmap);
      return { content: [{ type: 'text' as const, text: JSON.stringify(feature, null, 2) }] };
    },
  },
  {
    name: 'update_roadmap_feature',
    description: 'Patch fields on an existing roadmap feature',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project slug' },
        feature_id: { type: 'string', description: 'Feature ID' },
        updates: { type: 'object', description: 'Fields to update on the feature' },
      },
      required: ['project', 'feature_id', 'updates'],
    },
    schema: z.object({
      project: z.string(),
      feature_id: z.string(),
      updates: z.record(z.unknown()),
    }),
    handler: async (args: { project: string; feature_id: string; updates: Record<string, unknown> }) => {
      const roadmap = roadmapStore.readRoadmap(args.project);
      if (!roadmap) {
        return { content: [{ type: 'text' as const, text: 'No roadmap found' }] };
      }
      const idx = roadmap.features.findIndex(f => f.id === args.feature_id);
      if (idx === -1) {
        return { content: [{ type: 'text' as const, text: `Feature "${args.feature_id}" not found` }] };
      }
      // Prevent overwriting the id
      const { id: _id, ...safeUpdates } = args.updates as Record<string, unknown> & { id?: unknown };
      Object.assign(roadmap.features[idx], safeUpdates);
      roadmap.updated_at = new Date().toISOString();
      roadmapStore.writeRoadmap(args.project, roadmap);
      return { content: [{ type: 'text' as const, text: JSON.stringify(roadmap.features[idx], null, 2) }] };
    },
  },
  {
    name: 'delete_roadmap_feature',
    description: 'Remove a feature from the roadmap',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project slug' },
        feature_id: { type: 'string', description: 'Feature ID' },
      },
      required: ['project', 'feature_id'],
    },
    schema: z.object({
      project: z.string(),
      feature_id: z.string(),
    }),
    handler: async (args: { project: string; feature_id: string }) => {
      const roadmap = roadmapStore.readRoadmap(args.project);
      if (!roadmap) {
        return { content: [{ type: 'text' as const, text: 'No roadmap found' }] };
      }
      const idx = roadmap.features.findIndex(f => f.id === args.feature_id);
      if (idx === -1) {
        return { content: [{ type: 'text' as const, text: `Feature "${args.feature_id}" not found` }] };
      }
      roadmap.features.splice(idx, 1);
      roadmap.updated_at = new Date().toISOString();
      roadmapStore.writeRoadmap(args.project, roadmap);
      return { content: [{ type: 'text' as const, text: `Feature "${args.feature_id}" deleted` }] };
    },
  },
  {
    name: 'convert_feature_to_task',
    description: 'Create a board task from a roadmap feature and link them together',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project slug' },
        feature_id: { type: 'string', description: 'Roadmap feature ID' },
        epic_id: { type: 'number', description: 'Epic ID to create the task under' },
      },
      required: ['project', 'feature_id', 'epic_id'],
    },
    schema: z.object({
      project: z.string(),
      feature_id: z.string(),
      epic_id: z.number(),
    }),
    handler: async (args: { project: string; feature_id: string; epic_id: number }) => {
      const roadmap = roadmapStore.readRoadmap(args.project);
      if (!roadmap) {
        return { content: [{ type: 'text' as const, text: 'No roadmap found' }] };
      }
      const featureIdx = roadmap.features.findIndex(f => f.id === args.feature_id);
      if (featureIdx === -1) {
        return { content: [{ type: 'text' as const, text: `Feature "${args.feature_id}" not found` }] };
      }
      const feature = roadmap.features[featureIdx];

      const descriptionParts: string[] = [];
      descriptionParts.push(`## ${feature.title}`);
      if (feature.description) descriptionParts.push(`\n${feature.description}`);
      if (feature.rationale) descriptionParts.push(`\n### Rationale\n${feature.rationale}`);
      if (feature.userStories?.length) {
        descriptionParts.push(`\n### User Stories\n${feature.userStories.map(s => `- ${s}`).join('\n')}`);
      }
      if (feature.acceptanceCriteria?.length) {
        descriptionParts.push(`\n### Acceptance Criteria\n${feature.acceptanceCriteria.map(c => `- ${c}`).join('\n')}`);
      }
      const description = descriptionParts.join('\n');

      const task = store.createTask(args.project, args.epic_id, feature.title, description);

      // Link task → feature using updateTask (avoids a redundant read/write)
      store.updateTask(args.project, task.id, { linkedFeatureId: feature.id });

      // Link feature → task
      roadmap.features[featureIdx].linkedTaskId = task.id;
      roadmap.updated_at = new Date().toISOString();
      roadmapStore.writeRoadmap(args.project, roadmap);

      return {
        content: [{
          type: 'text' as const,
          text: [
            `Task #${task.id} created: "${task.title}"`,
            `Feature "${args.feature_id}" linked to task #${task.id}`,
            '',
            JSON.stringify(task, null, 2),
          ].join('\n'),
        }],
      };
    },
  },
] as const;
