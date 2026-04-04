import type { RoadmapFeatureStatus, RoadmapFeaturePriority } from './roadmap-types';

export interface RoadmapColumn {
  id: RoadmapFeatureStatus;
  label: string;
  color: string;
}

export const ROADMAP_COLUMNS: RoadmapColumn[] = [
  { id: 'backlog',     label: 'Backlog',      color: 'var(--status-backlog)' },
  { id: 'planning',    label: 'Planning',     color: 'var(--status-planning)' },
  { id: 'in_progress', label: 'In Progress',  color: 'var(--status-in-progress)' },
  { id: 'done',        label: 'Done',         color: 'var(--status-done)' },
];

export const ROADMAP_PRIORITY_LABELS: Record<RoadmapFeaturePriority, string> = {
  must:   'Must Have',
  should: 'Should Have',
  could:  'Could Have',
  wont:   "Won't Have",
};

export const ROADMAP_PRIORITY_CONFIG: Record<RoadmapFeaturePriority, { label: string; color: string; bg: string; border: string }> = {
  must:   { label: 'Must Have',    color: '#dc2626', bg: 'rgba(220,38,38,0.1)',   border: 'rgba(220,38,38,0.2)' },
  should: { label: 'Should Have',  color: '#d97706', bg: 'rgba(217,119,6,0.1)',   border: 'rgba(217,119,6,0.2)' },
  could:  { label: 'Could Have',   color: '#2563eb', bg: 'rgba(37,99,235,0.1)',   border: 'rgba(37,99,235,0.2)' },
  wont:   { label: "Won't Have",   color: '#9a9892', bg: 'rgba(154,152,146,0.1)', border: 'rgba(154,152,146,0.2)' },
};

export const ROADMAP_COMPLEXITY_CONFIG: Record<'low' | 'medium' | 'high', { label: string; color: string }> = {
  low:    { label: 'Low',    color: '#16a34a' },
  medium: { label: 'Medium', color: '#d97706' },
  high:   { label: 'High',   color: '#dc2626' },
};

export const ROADMAP_IMPACT_CONFIG: Record<'low' | 'medium' | 'high', { label: string; color: string }> = {
  low:    { label: 'Low',    color: '#9a9892' },
  medium: { label: 'Medium', color: '#2563eb' },
  high:   { label: 'High',   color: '#16a34a' },
};
