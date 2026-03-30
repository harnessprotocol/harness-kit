import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Task } from '../../lib/api';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy({}, {
    get: (_, tag) => {
      const Component = ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) => {
        const Tag = typeof tag === 'string' ? tag : 'div';
        const { initial, animate, exit, transition, whileHover, whileTap, style, className, ...rest } = props;
        return <Tag style={style as React.CSSProperties} className={className as string} {...rest}>{children}</Tag>;
      };
      Component.displayName = `motion.${String(tag)}`;
      return Component;
    },
  }),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  X: ({ size, ...props }: Record<string, unknown>) => <span data-testid="icon-x" {...props} />,
  Play: ({ size, ...props }: Record<string, unknown>) => <span data-testid="icon-play" {...props} />,
  Square: ({ size, ...props }: Record<string, unknown>) => <span data-testid="icon-square" {...props} />,
  Loader2: ({ size, ...props }: Record<string, unknown>) => <span data-testid="icon-loader" {...props} />,
  Plus: ({ size, ...props }: Record<string, unknown>) => <span data-testid="icon-plus" {...props} />,
  Trash2: ({ size, ...props }: Record<string, unknown>) => <span data-testid="icon-trash" {...props} />,
  Send: ({ size, ...props }: Record<string, unknown>) => <span data-testid="icon-send" {...props} />,
  ChevronDown: ({ size, ...props }: Record<string, unknown>) => <span data-testid="icon-chevron" {...props} />,
  Check: ({ size, ...props }: Record<string, unknown>) => <span data-testid="icon-check" {...props} />,
  Circle: ({ size, ...props }: Record<string, unknown>) => <span data-testid="icon-circle" {...props} />,
  CheckCircle2: ({ size, ...props }: Record<string, unknown>) => <span data-testid="icon-checkcircle2" {...props} />,
  AlertCircle: ({ size, ...props }: Record<string, unknown>) => <span data-testid="icon-alertcircle" {...props} />,
  Clock: ({ size, ...props }: Record<string, unknown>) => <span data-testid="icon-clock" {...props} />,
  ArrowDownToLine: ({ size, ...props }: Record<string, unknown>) => <span data-testid="icon-arrowdown" {...props} />,
  Pencil: ({ size, ...props }: Record<string, unknown>) => <span data-testid="icon-pencil" {...props} />,
}));

// Mock the api module
vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      tasks: {
        ...actual.api.tasks,
        update: vi.fn().mockResolvedValue({}),
      },
      comments: {
        create: vi.fn().mockResolvedValue({}),
      },
      logs: {
        tail: vi.fn().mockResolvedValue([]),
      },
    },
  };
});

// Mock useTaskLogs hook
vi.mock('../../hooks/useTaskLogs', () => ({
  useTaskLogs: vi.fn().mockReturnValue({ lines: [], loading: false, clearLogs: vi.fn() }),
}));

import { TaskDetailPanel } from '../TaskDetailPanel';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 7,
    title: 'Build notification system',
    description: 'Implement push notifications for task updates',
    status: 'in-progress',
    priority: 'high',
    linked_commits: ['abc123', 'def456'],
    comments: [
      { author: 'user', timestamp: '2024-01-01T00:00:00Z', body: 'Looks good' },
    ],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    subtasks: [
      { id: 1, title: 'Design schema', status: 'completed' },
      { id: 2, title: 'Implement handler', status: 'pending' },
    ],
    execution: {
      status: 'idle',
      phase: 'idle',
      phase_progress: 0,
      overall_progress: 0,
      phases: [],
    },
    ...overrides,
  };
}

const defaultProps = {
  projectSlug: 'test-project',
  onClose: vi.fn(),
  onTaskUpdated: vi.fn(),
};

describe('TaskDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when task is null', () => {
    const { container } = render(
      <TaskDetailPanel {...defaultProps} task={null} />,
    );
    // When task is null, AnimatePresence renders nothing
    expect(container.innerHTML).toBe('');
  });

  it('renders task title and ID in header', () => {
    render(<TaskDetailPanel {...defaultProps} task={makeTask()} />);
    expect(screen.getByText('Build notification system')).toBeInTheDocument();
    expect(screen.getByText('#7')).toBeInTheDocument();
  });

  it('shows 4 tabs: Overview, Subtasks, Logs, Comments', () => {
    render(<TaskDetailPanel {...defaultProps} task={makeTask()} />);
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Subtasks')).toBeInTheDocument();
    expect(screen.getByText('Logs')).toBeInTheDocument();
    expect(screen.getByText('Comments')).toBeInTheDocument();
  });

  it('shows RunStopControls in header', () => {
    render(<TaskDetailPanel {...defaultProps} task={makeTask()} />);
    // RunStopControls renders a "Run" button when status is idle
    expect(screen.getByText('Run')).toBeInTheDocument();
    expect(screen.getByText('Not started')).toBeInTheDocument();
  });

  it('Overview tab is shown by default', () => {
    render(<TaskDetailPanel {...defaultProps} task={makeTask()} />);
    // Overview tab shows Status section, Priority section, and Description
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Priority')).toBeInTheDocument();
    // Description section with the task description text
    expect(screen.getByText('Implement push notifications for task updates')).toBeInTheDocument();
  });
});
