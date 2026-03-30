import type { AgentProfile, PhaseName, PhaseConfig } from '../types.js';

const ALL_PHASES: PhaseName[] = ['spec', 'planning', 'coding', 'qa'];

function makeProfile(
  id: string, name: string, description: string, icon: string,
  specModel: string, planningModel: string, codingModel: string, qaModel: string,
  thinking: string = 'medium',
): AgentProfile {
  return {
    id, name, description, icon,
    phase_models: { spec: specModel, planning: planningModel, coding: codingModel, qa: qaModel },
    phase_thinking: Object.fromEntries(ALL_PHASES.map(p => [p, thinking])) as Record<PhaseName, string>,
  };
}

export const BUILT_IN_PROFILES: AgentProfile[] = [
  makeProfile(
    'auto', 'Auto (Optimized)',
    'Automatically selects the best model for each phase',
    'sparkles',
    'claude-sonnet-4-6', 'claude-sonnet-4-6', 'claude-opus-4-6', 'claude-sonnet-4-6',
    'high',
  ),
  makeProfile(
    'complex', 'Complex Tasks',
    'Uses Opus for all phases — best for large, intricate changes',
    'brain',
    'claude-opus-4-6', 'claude-opus-4-6', 'claude-opus-4-6', 'claude-opus-4-6',
    'high',
  ),
  makeProfile(
    'balanced', 'Balanced',
    'Uses Sonnet across all phases — good balance of speed and quality',
    'scale',
    'claude-sonnet-4-6', 'claude-sonnet-4-6', 'claude-sonnet-4-6', 'claude-sonnet-4-6',
    'medium',
  ),
  makeProfile(
    'quick', 'Quick Edits',
    'Fast model for simple tasks and small changes',
    'zap',
    'claude-haiku-4-5', 'claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-haiku-4-5',
    'low',
  ),
];

export function getProfile(id: string): AgentProfile | undefined {
  return BUILT_IN_PROFILES.find(p => p.id === id);
}

export function listProfiles(customProfiles: AgentProfile[] = []): AgentProfile[] {
  return [...BUILT_IN_PROFILES, ...customProfiles];
}

export function getDefaultPhaseConfig(profileId: string = 'auto'): PhaseConfig[] {
  const profile = getProfile(profileId) ?? BUILT_IN_PROFILES[0];
  return (['spec', 'planning', 'coding', 'qa'] as PhaseName[]).map(name => ({
    name,
    model: profile.phase_models[name],
    thinking_level: profile.phase_thinking[name],
    enabled: true,
  }));
}
