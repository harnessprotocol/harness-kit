import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import type { Task, TaskCategory, TaskComplexity, TaskPriority, TaskStatus } from '../../lib/board-api';
import type { Project } from '../../lib/board-api';
import { COLUMN_META, COLUMNS } from '../../lib/board-columns';
import { CATEGORY_CONFIG, COMPLEXITY_CONFIG } from '../../lib/board-task-meta';
import { CommentThread } from './CommentThread';
import { ProgressBar } from './ProgressBar';
import { SubtaskList } from './SubtaskList';
import { api } from '../../lib/board-api';
import { useExecution } from '../../contexts/ExecutionContext';
import type { HarnessInfo } from '@harness-kit/shared';

// Lazy-load xterm (heavy) — only mounted when Logs tab is shown
const TerminalView = lazy(() => import('../comparator/TerminalView'));

// ── Types ────────────────────────────────────────────────────

interface Props {
  task: Task | null;
  project: Project;
  onClose: () => void;
  onTaskUpdated: () => void;
  repoUrl?: string;
}

type TabId = 'overview' | 'subtasks' | 'logs' | 'files';

interface FileDiffEntry {
  filePath: string;
  diffText: string;
  changeType: string;
}

// ── Sub-components ───────────────────────────────────────────

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; bgColor: string; borderColor: string }> = {
  critical: { label: 'Critical', color: '#dc2626', bgColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)' },
  high: { label: 'High', color: '#ea580c', bgColor: 'rgba(249,115,22,0.1)', borderColor: 'rgba(249,115,22,0.2)' },
  medium: { label: 'Medium', color: '#ca8a04', bgColor: 'rgba(234,179,8,0.1)', borderColor: 'rgba(234,179,8,0.2)' },
  low: { label: 'Low', color: 'var(--text-muted)', bgColor: 'rgba(107,114,128,0.1)', borderColor: 'rgba(107,114,128,0.2)' },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 12, height: '100%', minHeight: 200,
      color: 'var(--text-muted)',
    }}>
      <span style={{ fontSize: 32 }}>{icon}</span>
      <span style={{ fontSize: 13 }}>{text}</span>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────

export function TaskDetailDialog({ task, project, onClose, onTaskUpdated, repoUrl }: Props) {
  const execution = useExecution();
  const navigate = useNavigate();

  const [copied, setCopied] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingPriority, setUpdatingPriority] = useState(false);
  const [updatingCategory, setUpdatingCategory] = useState(false);
  const [updatingComplexity, setUpdatingComplexity] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // Harness selection state
  const [selectedHarness, setSelectedHarness] = useState<string>('claude');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [detectedHarnesses, setDetectedHarnesses] = useState<HarnessInfo[]>([]);
  const [starting, setStopping] = useState(false);

  // Files tab
  const [fileDiffs, setFileDiffs] = useState<FileDiffEntry[]>([]);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  const isRunning = task ? execution.isRunning(task.id) : false;
  const execData = task ? execution.getExecution(task.id) : undefined;
  const rawChunks = task ? execution.getOutput(task.id) : [];
  const terminalId = execData?.terminalId ?? '';

  // Reset tab + state when task changes
  useEffect(() => {
    setActiveTab('overview');
    setExpandedFile(null);
    setFileDiffs([]);
  }, [task?.id]);

  // Sync harness/model from task defaults
  useEffect(() => {
    if (!task) return;
    setSelectedHarness(task.default_harness ?? project.default_harness ?? 'claude');
    setSelectedModel(task.default_model ?? project.default_model ?? '');
  }, [task?.id, project]);

  // Detect installed harnesses once
  useEffect(() => {
    invoke<HarnessInfo[]>('detect_harnesses').then(setDetectedHarnesses).catch(console.error);
  }, []);

  // Load git diff when Files tab active
  useEffect(() => {
    if (activeTab !== 'files' || !task?.worktree_path) return;
    invoke<FileDiffEntry[]>('get_diff_against_commit', {
      worktreePath: task.worktree_path,
      baseCommit: 'HEAD~1',
    }).then(setFileDiffs).catch(console.error);
  }, [activeTab, task?.worktree_path, execution.outputTick]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // ── Handlers ──────────────────────────────────────────────────

  async function handleStatusChange(newStatus: TaskStatus) {
    if (!task || updatingStatus) return;
    setUpdatingStatus(true);
    try {
      await api.tasks.update(project.slug, task.id, { status: newStatus });
      onTaskUpdated();
    } finally { setUpdatingStatus(false); }
  }

  async function handlePriorityChange(newPriority: TaskPriority) {
    if (!task || updatingPriority) return;
    setUpdatingPriority(true);
    try {
      await api.tasks.update(project.slug, task.id, { priority: newPriority });
      onTaskUpdated();
    } finally { setUpdatingPriority(false); }
  }

  async function handleCategoryChange(newCategory: TaskCategory) {
    if (!task || updatingCategory) return;
    setUpdatingCategory(true);
    try {
      await api.tasks.update(project.slug, task.id, { category: newCategory });
      onTaskUpdated();
    } finally { setUpdatingCategory(false); }
  }

  async function handleComplexityChange(newComplexity: TaskComplexity) {
    if (!task || updatingComplexity) return;
    setUpdatingComplexity(true);
    try {
      await api.tasks.update(project.slug, task.id, { complexity: newComplexity });
      onTaskUpdated();
    } finally { setUpdatingComplexity(false); }
  }

  async function handleAddComment(body: string) {
    if (!task) return;
    await api.comments.create(project.slug, task.id, { author: 'user', body });
    onTaskUpdated();
  }

  const handleStartStop = useCallback(async () => {
    if (!task || starting) return;
    setStopping(true);
    try {
      if (isRunning) {
        await execution.stopTask(project.slug, task.id);
        onTaskUpdated();
      } else {
        if (!execution.canStartMore(project)) {
          alert(`Concurrent task limit (${project.max_concurrent ?? 3}) reached.`);
          return;
        }
        await execution.startTask(project.slug, task, project, selectedHarness, selectedModel || undefined);
        onTaskUpdated();
        setActiveTab('logs');
      }
    } catch (err) {
      console.error('Start/stop failed:', err);
    } finally {
      setStopping(false);
    }
  }, [task, starting, isRunning, execution, project, selectedHarness, selectedModel, onTaskUpdated]);

  // ── Styles ────────────────────────────────────────────────────

  const pillBase: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    borderRadius: 9999, border: '1px solid var(--border-subtle)',
    padding: '4px 10px', fontSize: 11, fontWeight: 500,
    cursor: 'pointer', background: 'var(--bg-elevated)',
    color: 'var(--text-muted)', transition: 'all 0.15s',
  };

  const pillActive: React.CSSProperties = {
    ...pillBase,
    borderColor: 'var(--accent)',
    background: 'rgba(var(--accent-rgb, 99,102,241), 0.1)',
    color: 'var(--text-primary)',
  };

  const completedCount = task?.subtasks?.filter(s => s.status === 'completed').length ?? 0;
  const totalSubtasks = task?.subtasks?.length ?? 0;

  // Execution status
  const execStatus = task?.execution?.status;

  // Start/Stop button content
  let startStopLabel: string;
  if (starting) {
    startStopLabel = isRunning ? 'Stopping...' : 'Starting...';
  } else if (isRunning) {
    startStopLabel = '◼ Stop Task';
  } else if (execStatus === 'completed') {
    startStopLabel = '▶ Start Task';
  } else if (execStatus === 'failed') {
    startStopLabel = '▶ Retry';
  } else {
    startStopLabel = '▶ Start Task';
  }

  // ── Render ────────────────────────────────────────────────────

  return createPortal(
    <AnimatePresence>
      {task && (
        <div className="board-scope">
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              zIndex: 40,
            }}
          />

          {/* Dialog wrapper — uses flexbox centering to avoid transform conflict with Framer Motion */}
          <motion.div
            key="dialog-wrapper"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 50,
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
              padding: '16px 0',
              pointerEvents: 'none',
            }}
          >
          <motion.div
            key="dialog"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: 'spring', stiffness: 400, damping: 36 }}
            style={{
              width: '95vw', maxWidth: '64rem',
              height: 'calc(100vh - 32px)',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
              pointerEvents: 'auto',
            }}
          >
            {/* ── Header (Aperant-style) ── */}
            <div style={{
              padding: '20px 20px 16px', borderBottom: '1px solid var(--border-subtle)',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                {/* Left: title + metadata */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Title */}
                  <h2 style={{
                    margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--text-primary)',
                    lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {task.title}
                  </h2>

                  {/* Metadata row: epic badge, status badge, subtask count */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    {task.epic_name && (
                      <span style={{
                        fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)',
                        background: 'var(--bg-elevated)', borderRadius: 6,
                        padding: '2px 8px', border: '1px solid var(--border-subtle)',
                      }}>
                        {task.epic_name}
                      </span>
                    )}
                    {/* Status badge */}
                    <span style={{
                      fontSize: 11, fontWeight: 600, borderRadius: 6,
                      padding: '2px 8px', border: '1px solid transparent',
                      ...(isRunning ? {
                        color: '#3b82f6', background: 'rgba(59,130,246,0.1)', borderColor: 'rgba(59,130,246,0.3)',
                        animation: 'status-pulse 2s ease-in-out infinite',
                      } : task.status === 'done' ? {
                        color: '#22c55e', background: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.3)',
                      } : task.status === 'human-review' ? {
                        color: '#a855f7', background: 'rgba(168,85,247,0.1)', borderColor: 'rgba(168,85,247,0.3)',
                      } : {
                        color: 'var(--text-muted)', background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)',
                      }),
                    }}>
                      {isRunning ? 'In Progress' : COLUMN_META[task.status]?.label ?? task.status}
                    </span>
                    {/* Subtask count */}
                    {totalSubtasks > 0 && (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {completedCount}/{totalSubtasks} subtasks
                      </span>
                    )}
                    {task.blocked && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: '#ef4444',
                        background: 'rgba(239,68,68,0.1)', borderRadius: 4, padding: '1px 5px',
                        textTransform: 'uppercase',
                      }}>
                        Blocked
                      </span>
                    )}
                    {task.linkedFeatureId && (
                      <button
                        onClick={() => { onClose(); navigate(`/roadmap/${project.slug}`); }}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          fontSize: 11, fontWeight: 500, cursor: 'pointer',
                          background: 'rgba(37,99,235,0.08)',
                          color: '#2563eb',
                          border: '1px solid rgba(37,99,235,0.25)',
                          borderRadius: 6, padding: '2px 8px',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(37,99,235,0.15)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(37,99,235,0.08)'; }}
                        title="View linked roadmap feature"
                      >
                        {'↗'} View on Roadmap
                      </button>
                    )}
                  </div>
                </div>

                {/* Right: close button */}
                <button
                  onClick={onClose}
                  style={{
                    background: 'transparent', border: 'none',
                    color: 'var(--text-muted)', cursor: 'pointer',
                    fontSize: 20, lineHeight: 1, padding: 4,
                    borderRadius: 6, flexShrink: 0,
                  }}
                  title="Close (Esc)"
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
                >
                  ✕
                </button>
              </div>

              {/* Progress bar (when running or has progress) */}
              {totalSubtasks > 0 && (isRunning || completedCount > 0) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
                  <ProgressBar completed={completedCount} total={totalSubtasks} height={6} />
                  <span style={{
                    fontSize: 12, color: 'var(--text-muted)',
                    fontVariantNumeric: 'tabular-nums', width: 36, textAlign: 'right', flexShrink: 0,
                  }}>
                    {Math.round((completedCount / totalSubtasks) * 100)}%
                  </span>
                </div>
              )}
            </div>

            {/* ── Tab bar ── */}
            <div className="tab-bar" style={{ padding: '0 20px', flexShrink: 0 }}>
              {(['overview', 'subtasks', 'logs', 'files'] as TabId[]).map(tab => {
                let label = tab.charAt(0).toUpperCase() + tab.slice(1);
                if (tab === 'subtasks' && totalSubtasks > 0) label = `Subtasks (${totalSubtasks})`;
                if (tab === 'logs' && execStatus && execStatus !== 'idle') label = `Logs · ${execStatus}`;
                if (tab === 'files' && fileDiffs.length > 0) label = `Files (${fileDiffs.length})`;
                return (
                  <button
                    key={tab}
                    className={`tab ${activeTab === tab ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* ── Scrollable body ── */}
            <div style={{
              flex: 1, overflowY: activeTab === 'logs' ? 'hidden' : 'auto',
              padding: activeTab === 'logs' ? 0 : '20px',
              display: 'flex', flexDirection: 'column',
              gap: activeTab === 'logs' ? 0 : 24,
            }}>

              {/* ─── OVERVIEW TAB ─── */}
              {activeTab === 'overview' && (
                <>
                  <Section title="Status">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {COLUMNS.map(status => {
                        const meta = COLUMN_META[status];
                        const isActive = task.status === status;
                        return (
                          <button
                            key={status}
                            onClick={() => handleStatusChange(status)}
                            disabled={updatingStatus}
                            style={{ ...(isActive ? pillActive : pillBase), opacity: updatingStatus ? 0.5 : 1, cursor: updatingStatus ? 'not-allowed' : 'pointer' }}
                          >
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, display: 'inline-block' }} />
                            {meta.label}
                          </button>
                        );
                      })}
                    </div>
                  </Section>

                  <Section title="Priority">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {(Object.keys(PRIORITY_CONFIG) as TaskPriority[]).map(priority => {
                        const cfg = PRIORITY_CONFIG[priority];
                        const isActive = task.priority === priority;
                        return (
                          <button
                            key={priority}
                            onClick={() => handlePriorityChange(priority)}
                            disabled={updatingPriority}
                            style={{
                              display: 'inline-flex', alignItems: 'center',
                              borderRadius: 9999, padding: '4px 10px',
                              fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
                              cursor: updatingPriority ? 'not-allowed' : 'pointer',
                              opacity: updatingPriority ? 0.5 : 1, transition: 'all 0.15s',
                              border: isActive ? `1px solid ${cfg.borderColor}` : '1px solid var(--border-subtle)',
                              background: isActive ? cfg.bgColor : 'var(--bg-elevated)',
                              color: isActive ? cfg.color : 'var(--text-muted)',
                            }}
                          >
                            {cfg.label}
                          </button>
                        );
                      })}
                    </div>
                  </Section>

                  <Section title="Category">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {(Object.keys(CATEGORY_CONFIG) as TaskCategory[]).map(cat => {
                        const cfg = CATEGORY_CONFIG[cat];
                        const isActive = task.category === cat;
                        return (
                          <button
                            key={cat}
                            onClick={() => handleCategoryChange(cat)}
                            disabled={updatingCategory}
                            style={{
                              ...pillBase,
                              borderColor: isActive ? `${cfg.color}66` : 'var(--border-subtle)',
                              background: isActive ? `${cfg.color}15` : 'var(--bg-elevated)',
                              color: isActive ? cfg.color : 'var(--text-muted)',
                              fontWeight: isActive ? 600 : 500,
                              opacity: updatingCategory ? 0.5 : 1,
                              cursor: updatingCategory ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {cfg.label}
                          </button>
                        );
                      })}
                    </div>
                  </Section>

                  <Section title="Complexity">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {(Object.keys(COMPLEXITY_CONFIG) as TaskComplexity[]).map(cplx => {
                        const isActive = task.complexity === cplx;
                        return (
                          <button
                            key={cplx}
                            onClick={() => handleComplexityChange(cplx)}
                            disabled={updatingComplexity}
                            style={{ ...(isActive ? pillActive : pillBase), opacity: updatingComplexity ? 0.5 : 1, cursor: updatingComplexity ? 'not-allowed' : 'pointer' }}
                          >
                            {COMPLEXITY_CONFIG[cplx].label}
                          </button>
                        );
                      })}
                    </div>
                  </Section>

                  {task.description && (
                    <Section title="Description">
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                        {task.description}
                      </div>
                    </Section>
                  )}

                  {(task.branch || task.worktree_path) && (
                    <Section title="Git">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {task.branch && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 60, flexShrink: 0 }}>Branch</span>
                            {repoUrl ? (
                              <a href={`${repoUrl}/tree/${task.branch}`} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', borderRadius: 4, padding: '2px 6px', border: '1px solid var(--border-subtle)', textDecoration: 'none' }}>
                                {task.branch}
                              </a>
                            ) : (
                              <code style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', borderRadius: 4, padding: '2px 6px', border: '1px solid var(--border-subtle)' }}>
                                {task.branch}
                              </code>
                            )}
                          </div>
                        )}
                        {task.worktree_path && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 60, flexShrink: 0 }}>Worktree</span>
                            <code style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-elevated)', borderRadius: 4, padding: '2px 6px', border: '1px solid var(--border-subtle)', wordBreak: 'break-all', flex: 1 }}>
                              {task.worktree_path}
                            </code>
                            <button
                              onClick={() => { navigator.clipboard.writeText(task.worktree_path!); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, padding: '2px 4px', borderRadius: 4 }}
                            >
                              {copied ? 'Copied!' : '⎘'}
                            </button>
                          </div>
                        )}
                      </div>
                    </Section>
                  )}

                  {task.linked_commits.length > 0 && (
                    <Section title={`Commits (${task.linked_commits.length})`}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {task.linked_commits.map(sha => (
                          <code key={sha} style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', borderRadius: 4, padding: '2px 6px', border: '1px solid var(--border-subtle)', fontFamily: 'monospace', width: 'fit-content' }}>
                            {sha.slice(0, 12)}
                          </code>
                        ))}
                      </div>
                    </Section>
                  )}

                  {task.blocked && task.blocked_reason && (
                    <Section title="Blocked reason">
                      <div style={{ fontSize: 13, color: 'var(--blocked)', background: 'rgba(220,38,38,0.08)', borderRadius: 6, padding: '8px 10px', border: '1px solid rgba(220,38,38,0.2)' }}>
                        {task.blocked_reason}
                      </div>
                    </Section>
                  )}

                  <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 16 }}>
                    <span>Created {new Date(task.created_at).toLocaleDateString()}</span>
                    <span>Updated {new Date(task.updated_at).toLocaleDateString()}</span>
                  </div>

                  {/* Comments */}
                  <Section title={`Activity (${task.comments.length})`}>
                    <CommentThread comments={task.comments} onAdd={handleAddComment} />
                  </Section>
                </>
              )}

              {/* ─── SUBTASKS TAB ─── */}
              {activeTab === 'subtasks' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {totalSubtasks > 0 && (
                    <ProgressBar completed={completedCount} total={totalSubtasks} height={6} />
                  )}
                  <SubtaskList
                    subtasks={task.subtasks ?? []}
                    projectSlug={project.slug}
                    taskId={task.id}
                    onUpdated={onTaskUpdated}
                  />
                </div>
              )}

              {/* ─── LOGS TAB ─── */}
              {activeTab === 'logs' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  {isRunning && terminalId ? (
                    <Suspense fallback={<div style={{ padding: 20, color: 'var(--text-muted)' }}>Loading terminal...</div>}>
                      <TerminalView terminalId={terminalId} rawChunks={rawChunks} />
                    </Suspense>
                  ) : execStatus && execStatus !== 'idle' ? (
                    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {execStatus === 'completed' ? '✓ Completed' : execStatus === 'failed' ? '✗ Failed' : '◼ Stopped'}
                          {task.execution?.harness_id && ` · ${task.execution.harness_id}`}
                          {task.execution?.model && ` · ${task.execution.model}`}
                          {task.execution?.started_at && ` · ${new Date(task.execution.started_at).toLocaleTimeString()}`}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        Terminal output is not preserved after the process ends. Start the task again to see live output.
                      </div>
                    </div>
                  ) : (
                    <EmptyState icon="📋" text="No execution logs. Click Start Task to begin." />
                  )}
                </div>
              )}

              {/* ─── FILES TAB ─── */}
              {activeTab === 'files' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {!task.worktree_path ? (
                    <EmptyState icon="📁" text="No worktree linked. Start the task to create one." />
                  ) : fileDiffs.length === 0 ? (
                    <EmptyState icon="📄" text="No file changes detected yet." />
                  ) : (
                    fileDiffs.map(diff => {
                      const fileName = diff.filePath.split('/').pop() ?? diff.filePath;
                      const isExpanded = expandedFile === diff.filePath;
                      const changeColor = diff.changeType === 'added' ? '#22c55e' : diff.changeType === 'deleted' ? '#ef4444' : '#f59e0b';
                      return (
                        <div key={diff.filePath} style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
                          <button
                            onClick={() => setExpandedFile(isExpanded ? null : diff.filePath)}
                            style={{
                              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                              padding: '10px 14px', background: 'var(--bg-elevated)',
                              border: 'none', cursor: 'pointer', textAlign: 'left',
                            }}
                          >
                            <span style={{ fontSize: 10, fontWeight: 700, color: changeColor, textTransform: 'uppercase', width: 52, flexShrink: 0 }}>
                              {diff.changeType}
                            </span>
                            <span style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={diff.filePath}>
                              {fileName}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{diff.filePath}</span>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
                          </button>
                          {isExpanded && diff.diffText && (
                            <pre style={{
                              margin: 0, padding: '12px 14px',
                              fontSize: 11, fontFamily: 'monospace', lineHeight: 1.5,
                              background: '#0d0d1a', color: '#d0d0dc',
                              overflowX: 'auto', maxHeight: 400, overflowY: 'auto',
                              whiteSpace: 'pre',
                            }}>
                              {diff.diffText.split('\n').map((line, i) => {
                                const color = line.startsWith('+') ? '#22c55e' : line.startsWith('-') ? '#ef4444' : line.startsWith('@@') ? '#60a5fa' : '#d0d0dc';
                                return <span key={i} style={{ color, display: 'block' }}>{line}</span>;
                              })}
                            </pre>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* ── Footer (Aperant-style) ── */}
            <div style={{
              padding: '12px 20px', borderTop: '1px solid var(--border-subtle)',
              display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
            }}>
              {/* Left: Delete Task */}
              <button
                onClick={() => { /* TODO: delete confirmation */ }}
                disabled={isRunning}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px', borderRadius: 6, fontSize: 12,
                  border: 'none', background: 'transparent',
                  color: 'var(--text-muted)', cursor: isRunning ? 'not-allowed' : 'pointer',
                  opacity: isRunning ? 0.4 : 1, transition: 'color 0.15s',
                }}
                onMouseEnter={e => { if (!isRunning) (e.currentTarget as HTMLElement).style.color = '#ef4444'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                Delete Task
              </button>

              {/* Center: Harness + Model selectors */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <select
                  value={selectedHarness}
                  onChange={e => setSelectedHarness(e.target.value)}
                  disabled={isRunning}
                  style={{
                    fontSize: 11, padding: '4px 6px', borderRadius: 6,
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                    color: 'var(--text-muted)', cursor: isRunning ? 'not-allowed' : 'pointer',
                    opacity: isRunning ? 0.5 : 1,
                  }}
                >
                  {detectedHarnesses.filter(h => h.available).map(h => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                  {detectedHarnesses.filter(h => h.available).length === 0 && (
                    <option value="claude">Claude Code</option>
                  )}
                </select>
                <input
                  type="text"
                  placeholder="Model"
                  value={selectedModel}
                  onChange={e => setSelectedModel(e.target.value)}
                  disabled={isRunning}
                  style={{
                    fontSize: 11, padding: '4px 6px', borderRadius: 6, width: 120,
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                    color: 'var(--text-muted)', opacity: isRunning ? 0.5 : 1,
                  }}
                />
              </div>

              {/* Right: Start/Stop + Close */}
              <button
                onClick={handleStartStop}
                disabled={starting}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  border: isRunning ? '1px solid rgba(239,68,68,0.3)' : '1px solid transparent',
                  background: isRunning ? 'rgba(239,68,68,0.1)' : 'var(--accent)',
                  color: isRunning ? '#ef4444' : '#fff',
                  cursor: starting ? 'not-allowed' : 'pointer',
                  opacity: starting ? 0.6 : 1, transition: 'all 0.15s',
                  flexShrink: 0,
                }}
              >
                {startStopLabel}
              </button>

              <button
                onClick={onClose}
                style={{
                  padding: '7px 14px', borderRadius: 8, fontSize: 13,
                  border: '1px solid var(--border-subtle)', background: 'transparent',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                  flexShrink: 0, transition: 'all 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)'; }}
              >
                Close
              </button>
            </div>
          </motion.div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
