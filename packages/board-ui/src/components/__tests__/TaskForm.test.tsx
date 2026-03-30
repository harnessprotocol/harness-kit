import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Epic } from '../../lib/api';

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

// Mock the api module
vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      tasks: {
        ...actual.api.tasks,
        create: vi.fn().mockResolvedValue({ id: 1, title: 'Created Task' }),
      },
      profiles: {
        list: vi.fn().mockResolvedValue([]),
      },
    },
  };
});

import { TaskForm } from '../TaskForm';
import { api } from '../../lib/api';

const mockEpics: Epic[] = [
  {
    id: 1,
    name: 'Sprint 1',
    status: 'active',
    tasks: [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
];

const defaultProps = {
  open: true,
  projectSlug: 'test-project',
  epics: mockEpics,
  defaultEpicId: 1,
  onClose: vi.fn(),
  onCreated: vi.fn(),
};

describe('TaskForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "Create New Task" heading when open', () => {
    render(<TaskForm {...defaultProps} />);
    expect(screen.getByText('Create New Task')).toBeInTheDocument();
  });

  it('does not render when open=false', () => {
    render(<TaskForm {...defaultProps} open={false} />);
    expect(screen.queryByText('Create New Task')).not.toBeInTheDocument();
  });

  it('shows description textarea as primary input', () => {
    render(<TaskForm {...defaultProps} />);
    const textarea = screen.getByPlaceholderText(/Describe the feature/i);
    expect(textarea).toBeInTheDocument();
    expect(textarea.tagName).toBe('TEXTAREA');
  });

  it('shows "Isolated Workspace" info banner', () => {
    render(<TaskForm {...defaultProps} />);
    expect(screen.getByText('Isolated Workspace')).toBeInTheDocument();
  });

  it('shows agent profile selector', () => {
    render(<TaskForm {...defaultProps} />);
    expect(screen.getByText('Agent Profile')).toBeInTheDocument();
  });

  it('submit button text is "Create Task"', () => {
    render(<TaskForm {...defaultProps} />);
    const button = screen.getByRole('button', { name: 'Create Task' });
    expect(button).toBeInTheDocument();
  });

  it('shows error when description is empty on submit', async () => {
    render(<TaskForm {...defaultProps} />);
    const submitButton = screen.getByRole('button', { name: 'Create Task' });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Description is required')).toBeInTheDocument();
    });
  });

  it('calls api.tasks.create on valid submit', async () => {
    render(<TaskForm {...defaultProps} />);

    const textarea = screen.getByPlaceholderText(/Describe the feature/i);
    fireEvent.change(textarea, { target: { value: 'Build a notification system' } });

    const submitButton = screen.getByRole('button', { name: 'Create Task' });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(api.tasks.create).toHaveBeenCalledWith(
        'test-project',
        1,
        expect.objectContaining({
          title: 'Build a notification system',
          description: 'Build a notification system',
        }),
      );
    });
  });
});
