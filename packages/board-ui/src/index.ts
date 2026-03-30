// API client and configuration
export { configureBoardApi, getBoardApiBase, api, apiFetch } from './lib/api';

// Types
export type {
  Task, Epic, Project, Comment, Subtask,
  TaskPriority, TaskStatus, EpicStatus,
  PhaseName, PhaseStatus, ExecutionPhase, ExecutionStatus,
  PhaseConfig, PhaseProgress, TaskExecution, AgentProfile,
} from './lib/api';

// Column metadata
export { COLUMNS, COLUMN_META } from './lib/columns';

// Utility
export { cn } from './lib/utils';

// Hooks
export { useWebSocket } from './hooks/useWebSocket';
export { useBoardData } from './hooks/useBoardData';
export { useTaskLogs } from './hooks/useTaskLogs';

// Context
export { BoardProvider, useBoardContext } from './context/BoardContext';

// Components — re-export from components/index.ts
export * from './components/index';
