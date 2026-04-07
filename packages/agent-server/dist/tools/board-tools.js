// packages/agent-server/src/tools/board-tools.ts
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
const BOARD_MCP_PORT = Number(process.env.BOARD_MCP_PORT ?? 4800);
export async function buildBoardTools() {
    const client = new MultiServerMCPClient({
        board: {
            transport: 'http',
            url: `http://localhost:${BOARD_MCP_PORT}/mcp`,
        },
    });
    try {
        await client.initializeConnections();
        return client.getTools();
    }
    catch {
        // Board MCP endpoint not available — return empty tools array
        return [];
    }
}
