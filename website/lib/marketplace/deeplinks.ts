import type { MarketplaceMcp } from './types';

/**
 * Generates a Cursor one-click MCP install deep-link.
 * Format: cursor://anysphere.cursor-deeplink/mcp/install?name=<name>&config=<base64>
 * Config is base64(JSON({ type, command, args })) — Cursor's expected MCP server shape.
 *
 * Only call when plugin.mcp is non-null.
 */
export function cursorDeepLink(pluginName: string, mcp: MarketplaceMcp): string {
  const config = JSON.stringify({
    type: mcp.transport,
    command: mcp.command,
    args: mcp.args.length > 0 ? mcp.args : undefined,
  });
  const encoded = btoa(config);
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(pluginName)}&config=${encoded}`;
}
