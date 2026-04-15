import type { ToolDef as TauriToolDef } from '../../lib/tauri';

// Re-export the Tauri wire type
export type { TauriToolDef };

/** JSON Schema subset used for tool parameter definitions */
export type JSONSchema = Record<string, unknown>;

/** Result returned by a tool handler */
export interface ToolResult {
  ok: boolean;
  content: unknown;
}

/**
 * A registered tool definition.
 * - `read` tools auto-run without user approval.
 * - `write` tools pause for an inline approval card before running.
 */
export interface ToolDef {
  /** Dot-case name sent to Ollama, e.g. "security.read_permissions" */
  name: string;
  description: string;
  parameters: JSONSchema;
  category: 'read' | 'write';
  handler: (args: unknown) => Promise<ToolResult>;
  /** Human-readable summary for the approval card (write tools only) */
  describe: (args: unknown) => string;
}

/** Convert a ToolDef registry to the array Ollama expects */
export function toolsForOllama(registry: ToolDef[]): TauriToolDef[] {
  return registry.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}
