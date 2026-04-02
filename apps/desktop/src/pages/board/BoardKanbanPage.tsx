import { useState, useCallback, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
import { useBoardData } from '../../hooks/useBoardData';
import { useBoardServerReady } from '../../hooks/useBoardServerReady';
import { BoardServerOffline } from '../../components/board/BoardServerOffline';
import { DroppableColumn } from '../../components/board/DroppableColumn';
import { SwimlaneView } from '../../components/board/SwimlaneView';
import { ViewToggle, type ViewMode } from '../../components/board/ViewToggle';
import { TaskCard } from '../../components/board/TaskCard';
import { TaskDetailPanel } from '../../components/board/TaskDetailPanel';
import { TaskForm } from '../../components/board/TaskForm';
import { api } from '../../lib/board-api';
import type { Task, Epic, TaskStatus, Project } from '../../lib/board-api';
import { COLUMNS } from '../../lib/board-columns';

const LS_VIEW_KEY = 'harness:board:view';
const LS_COLLAPSED_KEY = 'harness:board:collapsed';

function flattenTasks(epics: Epic[]): Task[] {
  return epics.flatMap(epic =>
    epic.tasks.map(task => ({ ...task, epic_id: epic.id, epic_name: epic.name }))
  );
}

function formatSyncedAgo(date: Date | null): string | null {
  if (!date) return null;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function resolveTargetStatus(overId: string, allTasks: Task[]): TaskStatus | null {
  if (overId.startsWith('col-')) return overId.replace('col-', '') as TaskStatus;
  if (overId.startsWith('swim-')) {
    const parts = overId.split('-');
    return parts.slice(2).join('-') as TaskStatus;
  }
  if (overId.startsWith('task-')) {
    const targetTask = allTasks.find(t => t.id === Number(overId.replace('task-', '')));
    return targetTask?.status ?? null;
  }
  return null;
}

export default function BoardKanbanPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const projectSlug = slug!;
  const serverState = useBoardServerReady();
  const { ready, timedOut } = serverState;
  const { project, loading, error, refetch, lastSyncedAt } = useBoardData(projectSlug, ready);
  const [projects, setProjects] = useState<Project[]>([]);

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formDefaultStatus, setFormDefaultStatus] = useState<TaskStatus>('planning');
  const [formDefaultEpicId, setFormDefaultEpicId] = useState<number | undefined>();
  const [viewMode, setViewMode] = useState<ViewMode>('columns');
  const [collapsedColumns, setCollapsedColumns] = useState<Record<string, boolean>>({});
  const [, setNow] = useState(0); // forces re-render for "synced N ago" display

  // Restore view preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(LS_VIEW_KEY);
    if (saved === 'swimlane' || saved === 'columns') setViewMode(saved);
  }, []);

  // Restore collapsed columns from localStorage (default: backlog collapsed)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_COLLAPSED_KEY);
      if (saved) {
        setCollapsedColumns(JSON.parse(saved));
      } else {
        setCollapsedColumns({ backlog: true });
      }
    } catch { /* ignore malformed */ }
  }, []);

  // Tick every 15s to update "synced N ago"
  useEffect(() => {
    const id = setInterval(() => setNow(n => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  // Fetch project list for tab bar
  useEffect(() => {
    if (!ready) return;
    api.projects.list().then(setProjects).catch(() => {});
  }, [ready]);

  function handleViewChange(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem(LS_VIEW_KEY, mode);
  }

  function toggleCollapse(col: string) {
    setCollapsedColumns(prev => {
      const next = { ...prev, [col]: !prev[col] };
      localStorage.setItem(LS_COLLAPSED_KEY, JSON.stringify(next));
      return next;
    });
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

    // Expand collapsed column on drop
    if (collapsedColumns[targetStatus]) {
      setCollapsedColumns(prev => {
        const next = { ...prev, [targetStatus]: false };
        localStorage.setItem(LS_COLLAPSED_KEY, JSON.stringify(next));
        return next;
      });
    }

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

  if (timedOut) {
    return <BoardServerOffline serverState={serverState} />;
  }

  if (!ready || loading) {
    return (
      <div className="board-scope" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          {!ready ? 'Connecting to board server...' : 'Loading board...'}
        </span>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="board-scope" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: 32 }}>{'\u26A0\uFE0F'}</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          {error ?? `Project "${projectSlug}" not found`}
        </span>
      </div>
    );
  }

  return (
    <div className="board-scope" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
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

          {/* View toggle + connection status + restart */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <ViewToggle mode={viewMode} onChange={handleViewChange} />

            {/* Connection status pill */}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                color: 'var(--text-muted)',
                padding: '2px 8px',
                borderRadius: 6,
                border: '1px solid var(--border-subtle)',
                background: 'transparent',
                whiteSpace: 'nowrap',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: serverState.timedOut
                    ? 'var(--danger)'
                    : serverState.ready
                      ? 'var(--success)'
                      : 'var(--warning)',
                  flexShrink: 0,
                }}
              />
              {serverState.timedOut
                ? 'Offline'
                : serverState.ready
                  ? (lastSyncedAt ? `Synced ${formatSyncedAgo(lastSyncedAt)}` : 'Connected')
                  : 'Connecting...'}
            </span>

            <button
              onClick={serverState.restart}
              disabled={serverState.starting}
              title="Restart board server"
              style={{
                fontSize: 11,
                padding: '3px 8px',
                borderRadius: 5,
                border: '1px solid var(--border-subtle)',
                background: 'transparent',
                color: 'var(--text-muted)',
                cursor: serverState.starting ? 'not-allowed' : 'pointer',
                opacity: serverState.starting ? 0.5 : 1,
                transition: 'color 0.1s, border-color 0.1s',
              }}
              onMouseEnter={e => {
                if (!serverState.starting) {
                  (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                }
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)';
              }}
            >
              {serverState.starting ? 'Restarting...' : 'Restart'}
            </button>
          </div>
        </div>

        {/* Project tab bar — only shown when 2+ projects exist */}
        {projects.length >= 2 && (
          <div
            style={{
              display: 'flex',
              gap: 0,
              padding: '0 24px',
              overflowX: 'auto',
            }}
          >
            {projects.map(p => {
              const isActive = p.slug === projectSlug;
              return (
                <button
                  key={p.slug}
                  onClick={() => navigate(`/board/${p.slug}`)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '6px 10px',
                    fontSize: 11,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'color 0.1s',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
                  }}
                  onMouseLeave={e => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
                  }}
                >
                  {p.color && (
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                  )}
                  {p.name}
                </button>
              );
            })}
          </div>
        )}
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
                collapsed={!!collapsedColumns[col]}
                onToggleCollapse={() => toggleCollapse(col)}
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
