import { spawn, type ChildProcess } from 'node:child_process';
import { updateExecution } from '../store/yaml-store.js';
import { appendLog } from '../store/log-store.js';
import type { PhaseConfig } from '../types.js';

// Aperant's phase transition protocol
const PHASE_MARKER = '__EXEC_PHASE__:';

interface RunConfig {
  slug: string;
  taskId: number;
  description: string;
  worktreePath?: string;
  phaseConfig?: PhaseConfig[];
  agentProfile?: string;
  onLog?: (line: string) => void;
  onPhaseChange?: (phase: string) => void;
}

export class TaskRunner {
  private processes = new Map<string, ChildProcess>();

  private key(slug: string, taskId: number): string {
    return `${slug}/${taskId}`;
  }

  isRunning(slug: string, taskId: number): boolean {
    const proc = this.processes.get(this.key(slug, taskId));
    return proc !== undefined && proc.exitCode === null;
  }

  async start(config: RunConfig): Promise<void> {
    const { slug, taskId, description, worktreePath, phaseConfig, agentProfile, onLog, onPhaseChange } = config;
    const k = this.key(slug, taskId);
    if (this.isRunning(slug, taskId)) {
      throw new Error(`Task ${taskId} is already running`);
    }

    const cwd = worktreePath ?? process.cwd();
    const phases = phaseConfig ?? [];
    const enabledPhaseNames = phases.filter(p => p.enabled).map(p => p.name);

    await updateExecution(slug, taskId, {
      status: 'running',
      phase: 'planning',
      phase_progress: 0,
      overall_progress: 0,
      agent_profile: agentProfile,
      phases: enabledPhaseNames.map(name => ({ name, status: 'pending' })),
      started_at: new Date().toISOString(),
    });

    const prompt = buildPrompt(description, phases);
    const proc = spawn('claude', ['--print', '--dangerously-skip-permissions'], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    this.processes.set(k, proc);

    // Update PID
    await updateExecution(slug, taskId, { pid: proc.pid });

    const processLine = (line: string) => {
      appendLog(slug, taskId, line);
      onLog?.(line);

      // Detect phase transitions from Aperant protocol
      if (line.includes(PHASE_MARKER)) {
        try {
          const jsonStr = line.slice(line.indexOf(PHASE_MARKER) + PHASE_MARKER.length);
          const { phase, message } = JSON.parse(jsonStr) as { phase: string; message?: string };
          onPhaseChange?.(phase);
          updateExecution(slug, taskId, {
            phase: phase as import('../types.js').ExecutionPhase,
            message,
            phases: [], // Will be properly tracked in a full impl
          }).catch(() => {});
        } catch { /* ignore malformed markers */ }
      }
    };

    const handleStream = (stream: NodeJS.ReadableStream) => {
      let buffer = '';
      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        lines.forEach(processLine);
      });
      stream.on('end', () => {
        if (buffer) processLine(buffer);
      });
    };

    if (proc.stdout) handleStream(proc.stdout);
    if (proc.stderr) handleStream(proc.stderr);

    proc.on('exit', async (code) => {
      this.processes.delete(k);
      const status = code === 0 ? 'completed' : 'failed';
      await updateExecution(slug, taskId, {
        status,
        phase: status === 'completed' ? 'complete' : 'failed',
        overall_progress: status === 'completed' ? 100 : undefined,
        completed_at: new Date().toISOString(),
      }).catch(() => {});
    });

    if (proc.stdin) {
      proc.stdin.write(prompt);
      proc.stdin.end();
    }
  }

  async stop(slug: string, taskId: number): Promise<void> {
    const proc = this.processes.get(this.key(slug, taskId));
    if (!proc) return;
    proc.kill('SIGTERM');
    // Force kill after 5s if still running
    setTimeout(() => {
      if (this.isRunning(slug, taskId)) {
        proc.kill('SIGKILL');
      }
    }, 5000);
    await updateExecution(slug, taskId, {
      status: 'cancelled',
      phase: 'failed',
      completed_at: new Date().toISOString(),
    });
  }

  /** Kill all running processes (used during shutdown) */
  stopAll(): void {
    for (const proc of this.processes.values()) {
      if (proc.exitCode === null) {
        proc.kill('SIGTERM');
      }
    }
    this.processes.clear();
  }
}

function buildPrompt(description: string, phases: PhaseConfig[]): string {
  const enabledPhases = phases.filter(p => p.enabled);
  const phaseInstructions = enabledPhases.length > 0
    ? `\n\nExecute in phases: ${enabledPhases.map(p => p.name).join(' → ')}. ` +
      `When starting each phase, emit: ${PHASE_MARKER}{"phase":"<name>","message":"Starting <name>"}\n`
    : '';
  return description + phaseInstructions;
}

// Singleton runner instance
export const taskRunner = new TaskRunner();
