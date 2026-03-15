'use client';

import { use, useState, useCallback, useEffect, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useBoardData } from '../hooks/useBoardData';
import { DroppableColumn } from '../components/DroppableColumn';
import { SwimlaneView } from '../components/SwimlaneView';
import { ViewToggle, type ViewMode } from '../components/ViewToggle';
import { TaskCard } from '../components/TaskCard';
import { TaskDetailPanel } from '../components/TaskDetailPanel';
import { TaskForm } from '../components/TaskForm';
import { api } from '../lib/api';
import type { Task, Epic, TaskStatus } from '../lib/api';
import { COLUMNS } from '../lib/columns';
const LS_VIEW_KEY = 'harness:board:view';

function flattenTasks(epics: Epic[]): Task[] {
  return epics.flatMap(epic =>
    epic.tasks.map(task => ({ ...task, epic_id: epic.id, epic_name: epic.name }))
  );
}

function resolveTargetStatus(overId: string, allTasks: Task[]): TaskStatus | null {
  if (overId.startsWith('col-')) return overId.replace('col-', '') as TaskStatus;
  if (overId.startsWith('swim-')) {
    // swim-{epicId}-{status}
    const parts = overId.split('-');
    // status may contain hyphens (e.g. "in-progress" → parts[2]+parts[3])
    return parts.slice(2).join('-') as TaskStatus;
  }
  if (overId.startsWith('task-')) {
    const targetTask = allTasks.find(t => t.id === Number(overId.replace('task-', '')));
    return targetTask?.status ?? null;
  }
  return null;
}

export default function BoardPage({ params }: { params: Promise<{ project: string }> }) {
  const { project: projectSlug } = use(params);
  const { project, loading, error, refetch } = useBoardData(projectSlug);

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formDefaultStatus, setFormDefaultStatus] = useState<TaskStatus>('backlog');
  const [formDefaultEpicId, setFormDefaultEpicId] = useState<number | undefined>();
  const [viewMode, setViewMode] = useState<ViewMode>('columns');

  // Restore view preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(LS_VIEW_KEY);
    if (saved === 'swimlane' || saved === 'columns') setViewMode(saved);
  }, []);

  function handleViewChange(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem(LS_VIEW_KEY, mode);
  }

  // Escape closes detail panel
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && selectedTask) setSelectedTask(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedTask]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const allTasks = useMemo(() => project ? flattenTasks(project.epics) : [], [project]);
  const tasksByStatus = useMemo(() => Object.fromEntries(
    COLUMNS.map(col => [col, allTasks.filter(t => t.status === col)])
  ) as Record<TaskStatus, Task[]>, [allTasks]);

  function handleDragStart(event: DragStartEvent) {
    const id = Number(String(event.active.id).replace('task-', ''));
    const task = allTasks.find(t => t.id === id);
    if (task) setActiveTask(task);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    const { active, over } = event;
    if (!over || !project) return;

    const taskId = Number(String(active.id).replace('task-', ''));
    const targetStatus = resolveTargetStatus(String(over.id), allTasks);
    if (!targetStatus) return;

    const task = allTasks.find(t => t.id === taskId);
    if (!task || task.status === targetStatus) return;

    await api.tasks.update(projectSlug, taskId, { status: targetStatus });
    refetch();
  }

  const openTaskForm = useCallback((status: TaskStatus, epicId?: number) => {
    setFormDefaultStatus(status);
    setFormDefaultEpicId(epicId ?? project?.epics[0]?.id);
    setFormOpen(true);
  }, [project]);

  // Keep detail panel task in sync with live data
  useEffect(() => {
    if (!selectedTask || !project) return;
    const refreshed = allTasks.find(t => t.id === selectedTask.id);
    if (refreshed) setSelectedTask(refreshed);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading board…</span>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: 32 }}>⚠️</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          {error ?? `Project "${projectSlug}" not found`}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Is the board server running on :4800?</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{
          padding: '12px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
        }}
      >
        {project.color && (
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: project.color, flexShrink: 0 }} />
        )}
        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
          {project.name}
        </h1>
        {project.description && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{project.description}</span>
        )}
        {project.repo_url && (
          <a
            href={project.repo_url}
            target="_blank"
            rel="noopener noreferrer"
            title="View on GitHub"
            style={{
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              padding: 4,
              borderRadius: 4,
              transition: 'color 0.1s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
          </a>
        )}
        <span
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            background: 'var(--bg-elevated)',
            borderRadius: 6,
            padding: '2px 8px',
            border: '1px solid var(--border-subtle)',
          }}
        >
          {allTasks.length} task{allTasks.length !== 1 ? 's' : ''}
        </span>

        {/* View toggle */}
        <div style={{ marginLeft: 'auto' }}>
          <ViewToggle mode={viewMode} onChange={handleViewChange} />
        </div>
      </div>

      {/* Board — shared DnD context for both views */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {viewMode === 'columns' ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              gap: 16,
              padding: 20,
              overflowX: 'auto',
              overflowY: 'hidden',
              alignItems: 'flex-start',
            }}
          >
            {COLUMNS.map(col => (
              <DroppableColumn
                key={col}
                status={col}
                tasks={tasksByStatus[col] ?? []}
                onTaskClick={task => setSelectedTask(task)}
                onAddTask={() => openTaskForm(col)}
                repoUrl={project.repo_url}
              />
            ))}
          </div>
        ) : (
          <SwimlaneView
            epics={project.epics}
            onTaskClick={task => setSelectedTask(task)}
            onAddTask={(status, epicId) => openTaskForm(status as TaskStatus, epicId)}
            repoUrl={project.repo_url}
          />
        )}

        <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
          {activeTask ? (
            <div style={{ opacity: 0.85, transform: 'rotate(1.5deg)' }}>
              <TaskCard task={activeTask} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <TaskDetailPanel
        task={selectedTask}
        projectSlug={projectSlug}
        onClose={() => setSelectedTask(null)}
        onTaskUpdated={refetch}
        repoUrl={project.repo_url}
      />

      <TaskForm
        open={formOpen}
        projectSlug={projectSlug}
        epics={project.epics.filter(e => e.status === 'active')}
        defaultEpicId={formDefaultEpicId}
        defaultStatus={formDefaultStatus}
        onClose={() => setFormOpen(false)}
        onCreated={refetch}
      />
    </div>
  );
}
