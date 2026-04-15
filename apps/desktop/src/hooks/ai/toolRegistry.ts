/**
 * Tool registry — the complete catalog of 12 tools across 5 surfaces.
 * Import toolsForOllama(TOOLS) to get the array the Ollama API expects.
 */
import type { ToolDef } from './toolTypes';
import { securityTools } from './handlers/security';
import { observatoryTools } from './handlers/observatory';
import { memoryTools } from './handlers/memory';
import { boardTools } from './handlers/board';
import { harnessTools } from './handlers/harness';

export const TOOLS: ToolDef[] = [
  ...securityTools,       // security.read_permissions, security.list_audit, security.apply_preset
  ...observatoryTools,    // observatory.stats, observatory.list_sessions
  ...memoryTools,         // memory.search, memory.get_graph_stats, memory.add_observation
  ...boardTools,          // board.list_projects, board.list_tasks, board.create_task
  ...harnessTools,        // harness.detect_agents
];

/** Models known to support Ollama tool-calling */
const TOOL_CAPABLE_PREFIXES = [
  'qwen3', 'qwen2.5', 'llama3.1', 'llama3.2',
  'mistral-nemo', 'command-r-plus', 'command-r',
];

export function modelSupportsTools(modelName: string): boolean {
  const lower = modelName.toLowerCase();
  return TOOL_CAPABLE_PREFIXES.some((p) => lower.startsWith(p));
}

export const SYSTEM_PROMPT =
  `You are the Harness Kit AI assistant. You have access to tools for reading and modifying security settings, ` +
  `viewing Claude usage statistics and sessions, searching memory, querying and updating the Kanban board, ` +
  `and detecting installed AI agent harnesses. Use tools when the user asks about any of these surfaces. ` +
  `Always cite the data you retrieved. For write operations, briefly explain what you are about to do before proceeding.`;
