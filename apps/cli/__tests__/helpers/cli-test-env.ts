import { vi } from "vitest";

/**
 * Mock environment for CLI command testing.
 * Captures console output and process.exit calls.
 */
export class CliTestEnv {
  public consoleLog: string[] = [];
  public consoleError: string[] = [];
  public exitCode: number | null = null;

  private originalLog: typeof console.log;
  private originalError: typeof console.error;
  private originalExit: typeof process.exit;

  constructor() {
    this.originalLog = console.log;
    this.originalError = console.error;
    this.originalExit = process.exit;
  }

  /**
   * Set up mocks. Call this before running the command.
   */
  setup(): void {
    console.log = vi.fn((...args: unknown[]) => {
      this.consoleLog.push(args.map(String).join(" "));
    });

    console.error = vi.fn((...args: unknown[]) => {
      this.consoleError.push(args.map(String).join(" "));
    });

    process.exit = vi.fn((code?: number) => {
      this.exitCode = code ?? 0;
      throw new Error(`process.exit(${code ?? 0})`);
    }) as never;
  }

  /**
   * Restore original functions. Call this in afterEach.
   */
  restore(): void {
    console.log = this.originalLog;
    console.error = this.originalError;
    process.exit = this.originalExit;
  }

  /**
   * Get all console.log output as a single string.
   */
  getLog(): string {
    return this.consoleLog.join("\n");
  }

  /**
   * Get all console.error output as a single string.
   */
  getError(): string {
    return this.consoleError.join("\n");
  }
}
