/**
 * Structured error logging for the AI chat feature.
 * All errors are prefixed with [ai-chat] for easy DevTools filtering.
 * The onAIError hook is test-injectable.
 */

type ErrorHandler = (scope: string, err: unknown) => void;

let _onError: ErrorHandler | null = null;

export function setAIErrorHandler(handler: ErrorHandler | null): void {
  _onError = handler;
}

export function logAIError(scope: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[ai-chat] ${scope}:`, message, err);
  _onError?.(scope, err);
}
