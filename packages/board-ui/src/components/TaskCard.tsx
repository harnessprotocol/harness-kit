import { useMemo } from 'react';
import {
  Play, Square, Clock, Target, Bug, Wrench, FileCode, Shield, Gauge,
  Loader2, AlertTriangle, Archive, MoreVertical,
} from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { cn } from '../lib/utils';
import { PhaseProgressIndicator } from './PhaseProgressIndicator';
import { COLUMNS } from '../lib/columns';
import type { Task, TaskStatus, Subtask } from '../lib/api';

// ---------------------------------------------------------------------------
// Prop types
// ---------------------------------------------------------------------------

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
  onStatusChange?: (newStatus: TaskStatus) => void;
  onAction?: (action: string, taskId: number) => void;
  repoUrl?: string;
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

type BadgeVariant = 'success' | 'info' | 'warning' | 'purple' | 'destructive' | 'secondary' | 'outline';

const STATUS_BADGE: Record<TaskStatus, { variant: BadgeVariant; label: string }> = {
  planning:       { variant: 'secondary', label: 'Pending' },
  'in-progress':  { variant: 'info',      label: 'Running' },
  'ai-review':    { variant: 'warning',   label: 'AI Review' },
  'human-review': { variant: 'purple',    label: 'Needs Review' },
  done:           { variant: 'success',   label: 'Complete' },
};

// ---------------------------------------------------------------------------
// Category icon mapping
// ---------------------------------------------------------------------------

const CATEGORY_ICONS: Record<string, typeof Target> = {
  feature:     Target,
  bug_fix:     Bug,
  refactor:    Wrench,
  docs:        FileCode,
  security:    Shield,
  performance: Gauge,
};

const CATEGORY_LABELS: Record<string, string> = {
  feature:     'Feature',
  bug_fix:     'Bug Fix',
  refactor:    'Refactor',
  docs:        'Docs',
  security:    'Security',
  performance: 'Performance',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return `${Math.floor(diffDay / 30)}mo ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TaskCard({ task, onClick, onStatusChange, onAction, repoUrl }: TaskCardProps) {
  const isRunning = task.status === 'in-progress';
  const executionPhase = task.execution?.phase;
  const hasActiveExecution = executionPhase
    && executionPhase !== 'idle'
    && executionPhase !== 'complete'
    && executionPhase !== 'failed';

  // Detect stuck tasks: running status but execution says idle/complete/failed
  const isStuck = isRunning
    && task.execution
    && (task.execution.status === 'completed' || task.execution.status === 'failed' || task.execution.status === 'cancelled');

  const subtasks: Subtask[] = task.subtasks ?? [];

  const relativeTime = useMemo(
    () => formatRelativeTime(task.updated_at),
    [task.updated_at],
  );

  // Phase label for the execution badge
  const phaseLabel = useMemo(() => {
    if (!executionPhase) return '';
    const labels: Record<string, string> = {
      spec: 'Spec', planning: 'Planning', coding: 'Coding',
      qa: 'QA', complete: 'Complete', failed: 'Failed', idle: 'Idle',
    };
    return labels[executionPhase] ?? executionPhase;
  }, [executionPhase]);

  // Status badge
  const { variant: statusVariant, label: statusLabel } = STATUS_BADGE[task.status] ?? STATUS_BADGE.planning;

  // Category icon + label
  const CategoryIcon = task.category ? CATEGORY_ICONS[task.category] : undefined;
  const categoryLabel = task.category ? (CATEGORY_LABELS[task.category] ?? task.category) : '';

  // Status menu items for "Move To"
  const statusMenuItems = useMemo(() => {
    if (!onStatusChange) return null;
    return COLUMNS.filter(s => s !== task.status).map(status => {
      const meta = STATUS_BADGE[status];
      return (
        <DropdownMenuItem
          key={status}
          onClick={() => onStatusChange(status)}
        >
          {meta?.label ?? status}
        </DropdownMenuItem>
      );
    });
  }, [task.status, onStatusChange]);

  // Action handlers
  const handleStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAction?.('start', task.id);
  };

  const handleStop = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAction?.('stop', task.id);
  };

  const handleArchive = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAction?.('archive', task.id);
  };

  return (
    <Card
      className={cn(
        'card-surface task-card-enhanced cursor-pointer',
        isRunning && !isStuck && 'ring-2 ring-[var(--primary)] border-[var(--primary)] task-running-pulse',
        isStuck && 'ring-2 ring-[var(--warning)] border-[var(--warning)] task-stuck-pulse',
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        {/* Title */}
        <h3 className="font-semibold text-sm text-[var(--foreground)] line-clamp-2 leading-snug">
          {task.title}
        </h3>

        {/* Description */}
        {task.description && (
          <p className="mt-2 text-xs text-[var(--muted-foreground)] line-clamp-2">
            {task.description.slice(0, 120)}
          </p>
        )}

        {/* Badges section */}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {/* Status badge */}
          <Badge variant={statusVariant} className="text-[10px] px-1.5 py-0.5">
            {statusLabel}
          </Badge>

          {/* Category badge with icon */}
          {task.category && CategoryIcon && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              <CategoryIcon className="h-2.5 w-2.5 mr-0.5" />
              {categoryLabel}
            </Badge>
          )}

          {/* Execution phase badge when actively running */}
          {hasActiveExecution && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 flex items-center gap-1">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              {phaseLabel}
            </Badge>
          )}

          {/* Blocked badge */}
          {task.blocked && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5 flex items-center gap-1">
              <AlertTriangle className="h-2.5 w-2.5" />
              Blocked
            </Badge>
          )}
        </div>

        {/* Progress section — show when subtasks exist or task is running */}
        {(subtasks.length > 0 || isRunning) && (
          <div className="mt-4">
            <PhaseProgressIndicator
              phase={task.execution?.phase}
              subtasks={subtasks}
              phaseProgress={task.execution?.phase_progress}
              isRunning={isRunning}
            />
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
            <Clock className="h-3 w-3" />
            <span>{relativeTime}</span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Action buttons based on status */}
            {task.status === 'planning' && onAction && (
              <Button
                variant="default"
                size="sm"
                className="h-7 px-2.5"
                onClick={handleStart}
              >
                <Play className="mr-1.5 h-3 w-3" />
                Start
              </Button>
            )}

            {task.status === 'in-progress' && onAction && (
              <Button
                variant="destructive"
                size="sm"
                className="h-7 px-2.5"
                onClick={handleStop}
              >
                <Square className="mr-1.5 h-3 w-3" />
                Stop
              </Button>
            )}

            {task.status === 'done' && onAction && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2.5"
                onClick={handleArchive}
              >
                <Archive className="mr-1.5 h-3 w-3" />
                Archive
              </Button>
            )}

            {/* Three-dot menu for Move To */}
            {statusMenuItems && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Task actions"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuLabel>Move to</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {statusMenuItems}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
