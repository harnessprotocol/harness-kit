// packages/agent-server/src/checkpointer.ts

import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

const HARNESS_DIR = join(homedir(), ".harness", "board");

export function createCheckpointer(): SqliteSaver {
  mkdirSync(HARNESS_DIR, { recursive: true });
  const dbPath = join(HARNESS_DIR, "agent-checkpoints.sqlite");
  // SqliteSaver.fromConnString returns a saver that calls setup() lazily on first access
  return SqliteSaver.fromConnString(dbPath);
}
