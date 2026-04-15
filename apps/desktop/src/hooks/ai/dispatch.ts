import type { ToolCall } from '../../lib/tauri';
import type { ToolDef, ToolResult } from './toolTypes';
import type { ApprovalState } from './approvalState';

export class AbortToolError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'AbortToolError';
  }
}

/**
 * Dispatch a single tool call.
 *
 * - Read tools auto-run.
 * - Write tools block on `requestApproval(rowId, summary)`.
 *   If the user denies, returns `{ ok: false, content: { error: 'user denied' } }`.
 * - Unknown tools return `{ ok: false, content: { error: 'unknown tool <name>' } }`.
 */
export async function dispatchToolCall(
  call: ToolCall,
  registry: ToolDef[],
  opts: {
    rowId: string;
    approval: ApprovalState;
  }
): Promise<ToolResult> {
  const { rowId, approval } = opts;
  const name = call.function.name;
  const args = call.function.arguments;

  const tool = registry.find((t) => t.name === name);
  if (!tool) {
    return { ok: false, content: { error: `unknown tool '${name}'` } };
  }

  if (tool.category === 'write') {
    const approved = await approval.requestApproval(rowId);
    if (!approved) {
      return { ok: false, content: { error: 'user denied' } };
    }
  }

  try {
    return await tool.handler(args);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, content: { error: msg } };
  }
}
