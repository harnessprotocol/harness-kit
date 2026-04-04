import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import * as roadmapStore from '../store/roadmap-store.js';
import * as store from '../store/yaml-store.js';
import type { RoadmapFeature } from '../roadmap-types.js';

export function createRoadmapRouter(): Router {
  const router = Router();

  // --- Roadmap ---

  router.get('/projects/:slug/roadmap', (req, res) => {
    try {
      const roadmap = roadmapStore.readRoadmap(req.params.slug);
      if (!roadmap) return res.status(404).json({ message: 'Not found' });
      res.json(roadmap);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  router.put('/projects/:slug/roadmap', (req, res) => {
    try {
      const now = new Date().toISOString();
      const roadmap = {
        ...req.body,
        projectSlug: req.params.slug,
        updated_at: now,
        created_at: req.body.created_at ?? now,
        id: req.body.id ?? randomUUID(),
      };
      roadmapStore.writeRoadmap(req.params.slug, roadmap);
      res.json(roadmap);
    } catch (err) {
      res.status(400).json({ message: String(err) });
    }
  });

  // --- Features ---

  router.get('/projects/:slug/roadmap/features', (req, res) => {
    try {
      const roadmap = roadmapStore.readRoadmap(req.params.slug);
      if (!roadmap) return res.status(404).json({ message: 'Not found' });
      let features = roadmap.features;
      if (req.query.status) features = features.filter(f => f.status === req.query.status);
      if (req.query.priority) features = features.filter(f => f.priority === req.query.priority);
      res.json(features);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  router.post('/projects/:slug/roadmap/features', (req, res) => {
    try {
      const roadmap = roadmapStore.readRoadmap(req.params.slug);
      if (!roadmap) return res.status(404).json({ message: 'Not found' });
      const feature: RoadmapFeature = {
        dependencies: [],
        acceptanceCriteria: [],
        userStories: [],
        competitorInsightIds: [],
        ...(req.body as Partial<RoadmapFeature>),
        id: randomUUID(),
      } as RoadmapFeature;
      roadmap.features.push(feature);
      roadmap.updated_at = new Date().toISOString();
      roadmapStore.writeRoadmap(req.params.slug, roadmap);
      res.status(201).json(feature);
    } catch (err) {
      res.status(400).json({ message: String(err) });
    }
  });

  router.patch('/projects/:slug/roadmap/features/:id', (req, res) => {
    try {
      const roadmap = roadmapStore.readRoadmap(req.params.slug);
      if (!roadmap) return res.status(404).json({ message: 'Not found' });
      const idx = roadmap.features.findIndex(f => f.id === req.params.id);
      if (idx === -1) return res.status(404).json({ message: 'Feature not found' });
      const { id: _id, ...safeUpdates } = req.body as Record<string, unknown> & { id?: unknown };
      Object.assign(roadmap.features[idx], safeUpdates);
      roadmap.updated_at = new Date().toISOString();
      roadmapStore.writeRoadmap(req.params.slug, roadmap);
      res.json(roadmap.features[idx]);
    } catch (err) {
      res.status(400).json({ message: String(err) });
    }
  });

  router.delete('/projects/:slug/roadmap/features/:id', (req, res) => {
    try {
      const roadmap = roadmapStore.readRoadmap(req.params.slug);
      if (!roadmap) return res.status(404).json({ message: 'Not found' });
      const idx = roadmap.features.findIndex(f => f.id === req.params.id);
      if (idx === -1) return res.status(404).json({ message: 'Feature not found' });
      roadmap.features.splice(idx, 1);
      roadmap.updated_at = new Date().toISOString();
      roadmapStore.writeRoadmap(req.params.slug, roadmap);
      res.status(204).send();
    } catch (err) {
      res.status(400).json({ message: String(err) });
    }
  });

  router.post('/projects/:slug/roadmap/features/:id/convert', (req, res) => {
    try {
      const { epic_id } = req.body as { epic_id?: number };
      if (!epic_id) return res.status(400).json({ message: 'epic_id is required' });

      const roadmap = roadmapStore.readRoadmap(req.params.slug);
      if (!roadmap) return res.status(404).json({ message: 'Not found' });
      const featureIdx = roadmap.features.findIndex(f => f.id === req.params.id);
      if (featureIdx === -1) return res.status(404).json({ message: 'Feature not found' });

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

      const task = store.createTask(req.params.slug, epic_id, feature.title, description);
      store.updateTask(req.params.slug, task.id, { linkedFeatureId: feature.id });

      roadmap.features[featureIdx].linkedTaskId = task.id;
      roadmap.updated_at = new Date().toISOString();
      roadmapStore.writeRoadmap(req.params.slug, roadmap);

      const updatedFeature = roadmap.features[featureIdx];
      res.status(201).json({ task, feature: updatedFeature });
    } catch (err) {
      res.status(400).json({ message: String(err) });
    }
  });

  // --- Competitor Analysis ---

  router.get('/projects/:slug/competitors', (req, res) => {
    try {
      const analysis = roadmapStore.readCompetitorAnalysis(req.params.slug);
      if (!analysis) return res.status(404).json({ message: 'Not found' });
      res.json(analysis);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });

  router.put('/projects/:slug/competitors', (req, res) => {
    try {
      const analysis = {
        ...req.body,
        created_at: req.body.created_at ?? new Date().toISOString(),
      };
      roadmapStore.writeCompetitorAnalysis(req.params.slug, analysis);
      res.json(analysis);
    } catch (err) {
      res.status(400).json({ message: String(err) });
    }
  });

  router.post('/projects/:slug/competitors', (req, res) => {
    try {
      const competitor = { ...req.body, id: randomUUID() };
      let analysis = roadmapStore.readCompetitorAnalysis(req.params.slug);
      if (!analysis) {
        analysis = {
          projectContext: { projectName: req.params.slug, projectType: '', targetAudience: '' },
          competitors: [],
          marketGaps: [],
          insightsSummary: { topPainPoints: [], differentiatorOpportunities: [], marketTrends: [] },
          researchMetadata: { searchQueriesUsed: [], sourcesConsulted: [], limitations: [] },
          created_at: new Date().toISOString(),
        };
      }
      analysis.competitors.push(competitor);
      roadmapStore.writeCompetitorAnalysis(req.params.slug, analysis);
      res.status(201).json(competitor);
    } catch (err) {
      res.status(400).json({ message: String(err) });
    }
  });

  return router;
}
