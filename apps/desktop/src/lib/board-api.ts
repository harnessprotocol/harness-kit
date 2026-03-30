import { configureBoardApi, getBoardApiBase } from '@harness-kit/board-ui';

// Configure the shared API client for desktop (direct connection)
configureBoardApi('http://localhost:4800/api/v1');

// Re-export everything
export { api, apiFetch, configureBoardApi, getBoardApiBase } from '@harness-kit/board-ui';
export type {
  Task, Epic, Project, Comment, Subtask,
  TaskPriority, TaskStatus, EpicStatus,
  PhaseName, PhaseStatus, ExecutionPhase, ExecutionStatus,
  PhaseConfig, PhaseProgress, TaskExecution, AgentProfile,
} from '@harness-kit/board-ui';

// Desktop-specific: export the base URL constant for backward compatibility
export const BOARD_SERVER_BASE = 'http://localhost:4800';
