import { createContext, useContext, useCallback } from 'react';
import type { Project, Epic, Task } from '../lib/api';
import { api } from '../lib/api';
import { useBoardData } from '../hooks/useBoardData';

interface BoardContextValue {
  project: Project | null;
  epics: Epic[];
  tasks: Task[];  // flat list of all tasks across all epics
  loading: boolean;
  error: string | null;
  slug: string;
  refetch: () => void;
  // Subtask operations
  addSubtask: (taskId: number, title: string) => Promise<void>;
  toggleSubtask: (taskId: number, subtaskId: number, completed: boolean) => Promise<void>;
  deleteSubtask: (taskId: number, subtaskId: number) => Promise<void>;
  // Execution operations
  startExecution: (taskId: number) => Promise<void>;
  stopExecution: (taskId: number) => Promise<void>;
}

const BoardContext = createContext<BoardContextValue | null>(null);

interface Props {
  slug: string;
  children: React.ReactNode;
}

export function BoardProvider({ slug, children }: Props) {
  const { project, loading, error, refetch } = useBoardData(slug);

  const epics = project?.epics ?? [];
  const tasks = epics.flatMap(epic => epic.tasks.map(t => ({ ...t, epic_id: epic.id, epic_name: epic.name })));

  const addSubtask = useCallback(async (taskId: number, title: string) => {
    await api.subtasks.create(slug, taskId, { title });
    refetch();
  }, [slug, refetch]);

  const toggleSubtask = useCallback(async (taskId: number, subtaskId: number, completed: boolean) => {
    await api.subtasks.update(slug, taskId, subtaskId, {
      status: completed ? 'completed' : 'pending',
    });
    refetch();
  }, [slug, refetch]);

  const deleteSubtask = useCallback(async (taskId: number, subtaskId: number) => {
    await api.subtasks.delete(slug, taskId, subtaskId);
    refetch();
  }, [slug, refetch]);

  const startExecution = useCallback(async (taskId: number) => {
    await api.execution.start(slug, taskId);
    refetch();
  }, [slug, refetch]);

  const stopExecution = useCallback(async (taskId: number) => {
    await api.execution.stop(slug, taskId);
    refetch();
  }, [slug, refetch]);

  return (
    <BoardContext.Provider value={{
      project, epics, tasks, loading, error, slug, refetch,
      addSubtask, toggleSubtask, deleteSubtask, startExecution, stopExecution,
    }}>
      {children}
    </BoardContext.Provider>
  );
}

export function useBoardContext(): BoardContextValue {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error('useBoardContext must be used within BoardProvider');
  return ctx;
}
