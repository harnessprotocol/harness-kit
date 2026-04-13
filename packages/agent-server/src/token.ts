// packages/agent-server/src/token.ts
// Shared-secret token for authenticating requests to the agent-server.
// The token is generated once and persisted to ~/.harness-kit/agent-server.token (mode 0600).
// The Tauri desktop app reads the same file via `get_agent_server_token` to include it in requests.

import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const TOKEN_DIR = join(homedir(), ".harness-kit");
const TOKEN_FILE = join(TOKEN_DIR, "agent-server.token");

let _cachedToken: string | null = null;

export function getOrCreateToken(): string {
  if (_cachedToken) return _cachedToken;

  try {
    const existing = readFileSync(TOKEN_FILE, "utf8").trim();
    if (existing.length >= 32) {
      _cachedToken = existing;
      return existing;
    }
  } catch {
    /* generate new */
  }

  mkdirSync(TOKEN_DIR, { recursive: true });
  const token = randomBytes(32).toString("hex");
  writeFileSync(TOKEN_FILE, token, { encoding: "utf8", mode: 0o600 });
  // Ensure the directory itself is not world-readable
  try {
    chmodSync(TOKEN_DIR, 0o700);
  } catch {
    /* best-effort */
  }

  _cachedToken = token;
  return token;
}
