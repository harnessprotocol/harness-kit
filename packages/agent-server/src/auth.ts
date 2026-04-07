// packages/agent-server/src/auth.ts
import { execFileSync } from 'node:child_process';

export type Credentials =
  | { type: 'apiKey';  value: string }
  | { type: 'oauth';   value: string };

export function readKeychainToken(): string | null {
  if (process.platform !== 'darwin') return null;
  for (const svc of ['Claude Code-credentials', 'Claude Code-credentials-518fa12f']) {
    try {
      const raw = execFileSync('security', ['find-generic-password', '-s', svc, '-w'], {
        timeout: 5000,
      }).toString().trim();
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const oauth = parsed.claudeAiOauth as Record<string, unknown> | undefined;
      if (typeof oauth?.accessToken === 'string') {
        const expiresAt = typeof oauth.expiresAt === 'number'
          ? (oauth.expiresAt > 1e12 ? oauth.expiresAt : oauth.expiresAt * 1000)
          : Infinity;
        if (expiresAt > Date.now()) return oauth.accessToken;
      }
    } catch { continue; }
  }
  return null;
}

export function resolveApiKey(): Credentials | null {
  if (process.env.ANTHROPIC_API_KEY) {
    return { type: 'apiKey', value: process.env.ANTHROPIC_API_KEY };
  }
  const token = readKeychainToken();
  if (token) return { type: 'oauth', value: token };
  return null;
}

export function buildClientOptions(): { apiKey?: string; authToken?: string } {
  const creds = resolveApiKey();
  if (!creds) throw new Error(
    'No Anthropic credentials. Set ANTHROPIC_API_KEY or authenticate Claude Code.'
  );
  return creds.type === 'apiKey'
    ? { apiKey: creds.value }
    : { apiKey: creds.value }; // LangChain uses apiKey for both
}
