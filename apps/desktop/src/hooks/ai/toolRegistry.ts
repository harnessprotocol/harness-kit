import type { ToolDef } from './toolTypes';
import type { ModelDetails } from '../../lib/tauri';
import { securityTools } from './handlers/security';
import { observatoryTools } from './handlers/observatory';
import { memoryTools } from './handlers/memory';
import { boardTools } from './handlers/board';
import { harnessTools } from './handlers/harness';
import { pluginTools } from './handlers/plugins';
import { mcpTools } from './handlers/mcp';
import { gitTools } from './handlers/git';
import { syncTools } from './handlers/sync';
import { parityTools } from './handlers/parity';

export const TOOLS: ToolDef[] = [
  ...securityTools,    // security.read_permissions, security.list_audit, security.apply_preset
  ...observatoryTools, // observatory.stats, observatory.list_sessions
  ...memoryTools,      // memory.search, memory.get_graph_stats, memory.add_observation
  ...boardTools,       // board.list_projects, board.list_tasks, board.create_task
  ...harnessTools,     // harness.detect_agents, harness.read_config, harness.write_config, harness.list_profiles
  ...pluginTools,      // plugins.list_installed, plugins.uninstall
  ...mcpTools,         // mcp.list, mcp.add, mcp.remove
  ...gitTools,         // git.diff, git.create_worktree, git.remove_worktree
  ...syncTools,        // sync.read_file, sync.write_files, sync.create_backup
  ...parityTools,      // parity.run_scan
];

export function modelSupportsTools(modelDetails: ModelDetails | null | undefined): boolean {
  return modelDetails?.capabilities?.includes('tools') ?? false;
}

export const SYSTEM_PROMPT =
  `You are the Harness Kit AI assistant, running inside the Harness Kit desktop app. ` +
  `You have access to tools across ten surfaces: security settings, Claude usage statistics, ` +
  `memory graph, Kanban board, harness configuration, plugins, MCP servers, git worktrees, ` +
  `file sync, and parity scanning. ` +
  `Use tools when the user asks about any of these surfaces. Always cite the data you retrieved. ` +
  `For write operations, briefly explain what you are about to do before invoking the tool.`;
