import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Task } from '../../lib/api';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy({}, {
    get: (_, tag) => {
      const Component = ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) => {
        const Tag = typeof tag === 'string' ? tag : 'div';
        // Filter out framer-motion-specific props
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
  Pencil: ({ size, ...props }: Record<string, unknown>) => <span data-testid="icon-pencil" {...props} />,
  FolderOpen: ({ size, ...props }: Record<string, unknown>) => <span data-testid="icon-folder" {...props} />,
  ChevronDown: ({ size, ...props }: Record<string, unknown>) => <span data-testid="icon-chevron" {...props} />,
  Sparkles: ({ size, ...props }: Record<string, unknown>) => <span data-testid="icon-sparkles" {...props} />,
  Brain: ({ size, ...props }: Record<string, unknown>) => <span data-testid="icon-brain" {...props} />,
  Scale: ({ size, ...props }: Record<string, unknown>) => <span data-testid="icon-scale" {...props} />,
  Zap: ({ size, ...props }: Record<string, unknown>) => <span data-testid="icon-zap" {...props} />,
  Info: ({ size, ...props }: Record<string, unknown>) => <span data-testid="icon-info" {...props} />,
  AlertTriangle: ({ size, ...props }: Record<string, unknown>) => <span data-testid="icon-alert" {...props} />,
  CheckCircle: ({ size, ...props }: Record<string, unknown>) => <span data-testid="icon-check" {...props} />,
  GitBranch: ({ size, ...props }: Record<string, unknown>) => <span data-testid="icon-git" {...props} />,
}));

import { TaskCard } from '../TaskCard';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 42,
    title: 'Implement OAuth login',
    description: 'Add OAuth2 support for GitHub and Google providers',
    status: 'planning',
    priority: 'high',
    linked_commits: [],
    comments: [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('TaskCard', () => {
  it('renders task title and ID', () => {
    render(<TaskCard task={makeTask()} />);
    expect(screen.getByText('Implement OAuth login')).toBeInTheDocument();
    expect(screen.getByText('#42')).toBeInTheDocument();
  });

  it('shows priority badge when task has priority', () => {
    render(<TaskCard task={makeTask({ priority: 'high' })} />);
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('does not show priority badge when priority is undefined', () => {
    render(<TaskCard task={makeTask({ priority: undefined })} />);
    expect(screen.queryByText('High')).not.toBeInTheDocument();
    expect(screen.queryByText('Medium')).not.toBeInTheDocument();
    expect(screen.queryByText('Low')).not.toBeInTheDocument();
    expect(screen.queryByText('Critical')).not.toBeInTheDocument();
  });

  it('shows description preview when present', () => {
    render(<TaskCard task={makeTask()} />);
    expect(screen.getByText('Add OAuth2 support for GitHub and Google providers')).toBeInTheDocument();
  });

  it('does not show description when absent', () => {
    render(<TaskCard task={makeTask({ description: undefined })} />);
    expect(screen.queryByText('Add OAuth2 support for GitHub and Google providers')).not.toBeInTheDocument();
  });

  it('shows "Blocked" indicator when task.blocked is true', () => {
    render(<TaskCard task={makeTask({ blocked: true })} />);
    expect(screen.getByText('Blocked')).toBeInTheDocument();
  });

  it('does not show "Blocked" indicator when task.blocked is false', () => {
    render(<TaskCard task={makeTask({ blocked: false })} />);
    expect(screen.queryByText('Blocked')).not.toBeInTheDocument();
  });

  it('shows ProgressBar when subtasks exist', () => {
    const task = makeTask({
      subtasks: [
        { id: 1, title: 'Sub 1', status: 'completed' },
        { id: 2, title: 'Sub 2', status: 'pending' },
      ],
    });
    const { container } = render(<TaskCard task={task} />);
    // ProgressBar renders a progress bar container with rounded-full
    const progressBars = container.querySelectorAll('.rounded-full');
    expect(progressBars.length).toBeGreaterThan(0);
  });

  it('shows PhaseStepsIndicator when execution has started', () => {
    const task = makeTask({
      execution: {
        status: 'running',
        phase: 'coding',
        phase_progress: 50,
        overall_progress: 40,
        phases: [
          { name: 'spec', status: 'completed' },
          { name: 'planning', status: 'completed' },
          { name: 'coding', status: 'running' },
          { name: 'qa', status: 'pending' },
        ],
      },
    });
    render(<TaskCard task={task} />);
    // PhaseStepsIndicator renders phase labels
    expect(screen.getByText('Spec')).toBeInTheDocument();
    expect(screen.getByText('Plan')).toBeInTheDocument();
    expect(screen.getByText('Code')).toBeInTheDocument();
  });

  it('shows running pulse class when execution status is running', () => {
    const task = makeTask({
      execution: {
        status: 'running',
        phase: 'coding',
        phase_progress: 50,
        overall_progress: 40,
        phases: [],
      },
    });
    const { container } = render(<TaskCard task={task} />);
    const card = container.firstElementChild;
    expect(card?.className).toContain('task-running-pulse');
  });

  it('does not show running pulse class when not running', () => {
    const task = makeTask({
      execution: {
        status: 'completed',
        phase: 'complete',
        phase_progress: 100,
        overall_progress: 100,
        phases: [],
      },
    });
    const { container } = render(<TaskCard task={task} />);
    const card = container.firstElementChild;
    expect(card?.className).not.toContain('task-running-pulse');
  });
});
