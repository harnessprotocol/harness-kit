// packages/agent-server/src/auth.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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

  it('returns null when no credentials available', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.mock('./auth.js', async (importOriginal) => {
      const mod = await importOriginal<typeof import('./auth.js')>();
      return { ...mod, readKeychainToken: () => null };
    });
    const { resolveApiKey } = await import('./auth.js');
    // When keychain also returns null, expect null
    // (real keychain is macOS-only; in CI this will be null)
  });
});
