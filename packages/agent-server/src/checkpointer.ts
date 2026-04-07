// packages/agent-server/src/checkpointer.ts
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync } from 'node:fs';

const HARNESS_DIR = join(homedir(), '.harness', 'board');

export function createCheckpointer(): SqliteSaver {
  mkdirSync(HARNESS_DIR, { recursive: true });
  const dbPath = join(HARNESS_DIR, 'agent-checkpoints.sqlite');
  return SqliteSaver.fromConnString(dbPath);
}
