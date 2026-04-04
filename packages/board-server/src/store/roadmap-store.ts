import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import yaml from 'js-yaml';
import type { Roadmap, CompetitorAnalysis } from '../roadmap-types.js';

function getBoardDir(): string {
  if (process.env.NODE_ENV === 'test' && process.env.BOARD_TEST_DIR) {
    return process.env.BOARD_TEST_DIR;
  }
  return path.join(os.homedir(), '.harness', 'board', 'projects');
}

let roadmapDirEnsured = false;
function ensureRoadmapDir(): void {
  if (roadmapDirEnsured) return;
  fs.mkdirSync(getBoardDir(), { recursive: true });
  roadmapDirEnsured = true;
}

// For testing: reset the roadmapDirEnsured flag
export function resetRoadmapDirCache(): void {
  roadmapDirEnsured = false;
}

function safePath(dir: string, filename: string): string {
  const filePath = path.resolve(dir, filename);
  // Ensure the resolved path stays within the board directory (prevents traversal)
  if (!filePath.startsWith(dir + path.sep)) {
    throw new Error(`Path traversal detected: ${filename}`);
  }
  return filePath;
}

function roadmapPath(slug: string): string {
  return safePath(getBoardDir(), `${slug}.roadmap.yaml`);
}

function competitorsPath(slug: string): string {
  return safePath(getBoardDir(), `${slug}.competitors.yaml`);
}

export function readRoadmap(slug: string): Roadmap | null {
  const filePath = roadmapPath(slug);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf-8');
  return yaml.load(raw) as Roadmap;
}

export function writeRoadmap(slug: string, roadmap: Roadmap): void {
  ensureRoadmapDir();
  const filePath = roadmapPath(slug);
  const raw = yaml.dump(roadmap, { lineWidth: 120 });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, raw, 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

export function readCompetitorAnalysis(slug: string): CompetitorAnalysis | null {
  const filePath = competitorsPath(slug);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf-8');
  return yaml.load(raw) as CompetitorAnalysis;
}

export function writeCompetitorAnalysis(slug: string, analysis: CompetitorAnalysis): void {
  ensureRoadmapDir();
  const filePath = competitorsPath(slug);
  const raw = yaml.dump(analysis, { lineWidth: 120 });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, raw, 'utf-8');
  fs.renameSync(tmpPath, filePath);
}
