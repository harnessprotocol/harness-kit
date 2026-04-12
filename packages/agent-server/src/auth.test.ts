// packages/agent-server/src/auth.test.ts
import { describe, it, expect, afterEach } from 'vitest';

describe('resolveApiKey', () => {
  const originalEnv = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalEnv;
  });

  it('prefers ANTHROPIC_API_KEY when set', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-123';
    const { resolveApiKey } = await import('./auth.js');
    const result = resolveApiKey();
    expect(result).toEqual({ type: 'apiKey', value: 'test-key-123' });
  });

  it('does not return an apiKey credential when ANTHROPIC_API_KEY is unset', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { resolveApiKey } = await import('./auth.js');
    const result = resolveApiKey();
    // Must not return an apiKey credential — env var is unset
    expect(result?.type).not.toBe('apiKey');
  });
});
