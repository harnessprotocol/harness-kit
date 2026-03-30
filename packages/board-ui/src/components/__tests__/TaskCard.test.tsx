import React from 'react';
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
        const { initial, animate, exit, transition, whileHover, whileTap, style, className, ...rest } = props;
        return <Tag style={style as React.CSSProperties} className={className as string} {...rest}>{children}</Tag>;
      };
      Component.displayName = `motion.${String(tag)}`;
      return Component;
    },
  }),
}));

// Mock lucide-react icons — return simple spans
vi.mock('lucide-react', () => {
  const icon = (name: string) => {
    const Comp = (props: Record<string, unknown>) => <span data-testid={`icon-${name}`} {...props} />;
    Comp.displayName = name;
    return Comp;
  };
  return {
    Play: icon('play'), Square: icon('square'), Clock: icon('clock'),
    Target: icon('target'), Bug: icon('bug'), Wrench: icon('wrench'),
    FileCode: icon('filecode'), Shield: icon('shield'), Gauge: icon('gauge'),
    Loader2: icon('loader2'), AlertTriangle: icon('alert-triangle'),
    Archive: icon('archive'), MoreVertical: icon('more-vertical'),
  };
});

// Mock ui primitives that don't exist yet
vi.mock('../ui/card', () => ({
  Card: ({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) =>
    <div className={className} onClick={onClick} data-testid="card">{children}</div>,
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    <div className={className}>{children}</div>,
}));

vi.mock('../ui/badge', () => ({
  Badge: ({ children, variant, className }: { children: React.ReactNode; variant?: string; className?: string }) =>
    <span data-variant={variant} className={className}>{children}</span>,
}));

vi.mock('../ui/button', () => ({
  Button: ({ children, onClick, className, ...props }: Record<string, unknown> & { children?: React.ReactNode; onClick?: (e: React.MouseEvent) => void; className?: string }) =>
    <button onClick={onClick} className={className}>{children}</button>,
}));

vi.mock('../ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
    <div role="menuitem" onClick={onClick}>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

import { TaskCard } from '../TaskCard';

const noop = () => {};

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
  it('renders task title', () => {
    render(<TaskCard task={makeTask()} onClick={noop} />);
    expect(screen.getByText('Implement OAuth login')).toBeInTheDocument();
  });

  it('shows status badge with correct label', () => {
    render(<TaskCard task={makeTask({ status: 'planning' })} onClick={noop} />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('shows Running status badge for in-progress tasks', () => {
    render(<TaskCard task={makeTask({ status: 'in-progress' })} onClick={noop} />);
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('shows description preview when present', () => {
    render(<TaskCard task={makeTask()} onClick={noop} />);
    expect(screen.getByText('Add OAuth2 support for GitHub and Google providers')).toBeInTheDocument();
  });

  it('does not show description when absent', () => {
    render(<TaskCard task={makeTask({ description: undefined })} onClick={noop} />);
    expect(screen.queryByText('Add OAuth2 support for GitHub and Google providers')).not.toBeInTheDocument();
  });

  it('shows "Blocked" indicator when task.blocked is true', () => {
    render(<TaskCard task={makeTask({ blocked: true })} onClick={noop} />);
    expect(screen.getByText('Blocked')).toBeInTheDocument();
  });

  it('does not show "Blocked" indicator when task.blocked is false', () => {
    render(<TaskCard task={makeTask({ blocked: false })} onClick={noop} />);
    expect(screen.queryByText('Blocked')).not.toBeInTheDocument();
  });

  it('shows progress section when subtasks exist', () => {
    const task = makeTask({
      subtasks: [
        { id: 1, title: 'Sub 1', status: 'completed' },
        { id: 2, title: 'Sub 2', status: 'pending' },
      ],
    });
    const { container } = render(<TaskCard task={task} onClick={noop} />);
    // PhaseProgressIndicator renders a progress bar container with rounded-full
    const progressBars = container.querySelectorAll('.rounded-full');
    expect(progressBars.length).toBeGreaterThan(0);
  });

  it('shows phase steps when execution has started', () => {
    const task = makeTask({
      status: 'in-progress',
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
    render(<TaskCard task={task} onClick={noop} />);
    // PhaseProgressIndicator renders phase step labels
    expect(screen.getByText('Spec')).toBeInTheDocument();
    expect(screen.getByText('Plan')).toBeInTheDocument();
    expect(screen.getByText('Code')).toBeInTheDocument();
  });

  it('shows running pulse class when task is in-progress', () => {
    const task = makeTask({
      status: 'in-progress',
      execution: {
        status: 'running',
        phase: 'coding',
        phase_progress: 50,
        overall_progress: 40,
        phases: [],
      },
    });
    const { container } = render(<TaskCard task={task} onClick={noop} />);
    const card = container.querySelector('[data-testid="card"]');
    expect(card?.className).toContain('task-running-pulse');
  });

  it('does not show running pulse class when not in-progress', () => {
    const task = makeTask({
      status: 'done',
      execution: {
        status: 'completed',
        phase: 'complete',
        phase_progress: 100,
        overall_progress: 100,
        phases: [],
      },
    });
    const { container } = render(<TaskCard task={task} onClick={noop} />);
    const card = container.querySelector('[data-testid="card"]');
    expect(card?.className).not.toContain('task-running-pulse');
  });

  it('shows category badge with label when category is set', () => {
    render(<TaskCard task={makeTask({ category: 'bug_fix' })} onClick={noop} />);
    expect(screen.getByText('Bug Fix')).toBeInTheDocument();
  });

  it('shows Start button for planning tasks when onAction is provided', () => {
    render(<TaskCard task={makeTask({ status: 'planning' })} onClick={noop} onAction={noop} />);
    expect(screen.getByText('Start')).toBeInTheDocument();
  });

  it('shows Stop button for in-progress tasks when onAction is provided', () => {
    render(<TaskCard task={makeTask({ status: 'in-progress' })} onClick={noop} onAction={noop} />);
    expect(screen.getByText('Stop')).toBeInTheDocument();
  });

  it('shows Archive button for done tasks when onAction is provided', () => {
    render(<TaskCard task={makeTask({ status: 'done' })} onClick={noop} onAction={noop} />);
    expect(screen.getByText('Archive')).toBeInTheDocument();
  });
});
