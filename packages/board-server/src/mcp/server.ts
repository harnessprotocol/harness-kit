import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { projectTools } from './tools/project.js';
import { epicTools } from './tools/epic.js';
import { taskTools } from './tools/task.js';

const allTools = [...projectTools, ...epicTools, ...taskTools];

type AnyTool = (typeof allTools)[number];
type ToolName = AnyTool['name'];
type ToolMap = Map<string, AnyTool>;

const toolMap: ToolMap = new Map(allTools.map(t => [t.name, t]));

export function createMcpServer() {
  const server = new Server(
    { name: 'harness-board', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = toolMap.get(name);
    if (!tool) {
      return {
        content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }
    try {
      const parsed = tool.schema.parse(args ?? {});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await (tool.handler as (a: any) => Promise<any>)(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text' as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}

// Entry point when running as standalone MCP server (stdio)
async function main() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server runs until stdin closes
}

main().catch((err) => {
  console.error('MCP server fatal error:', err);
  process.exit(1);
});
