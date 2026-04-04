import { createContext, useContext, type ReactNode } from 'react';
import { useTaskExecution, type UseTaskExecutionReturn } from '../hooks/useTaskExecution';

const ExecutionContext = createContext<UseTaskExecutionReturn | null>(null);

export function ExecutionProvider({ children }: { children: ReactNode }) {
  const execution = useTaskExecution();
  return (
    <ExecutionContext.Provider value={execution}>
      {children}
    </ExecutionContext.Provider>
  );
}

export function useExecution(): UseTaskExecutionReturn {
  const ctx = useContext(ExecutionContext);
  if (!ctx) throw new Error('useExecution must be used inside ExecutionProvider');
  return ctx;
}
