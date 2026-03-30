import { AnimatePresence, motion } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { Pencil, FolderOpen, X } from 'lucide-react';
import type { Epic, TaskStatus } from '../lib/api';
import { cn } from '../lib/utils';
import { api } from '../lib/api';
import { CollapsibleSection } from './CollapsibleSection';
import { InfoBanner } from './InfoBanner';
import { AgentProfileSelect } from './AgentProfileSelect';
import { PhaseConfigGrid } from './PhaseConfigGrid';
import { ClassificationFields } from './ClassificationFields';
import type { PhaseConfig } from '../lib/api';

const DEFAULT_PHASES: PhaseConfig[] = [
  { name: 'spec',     model: 'claude-opus-4-6', thinking_level: 'high', enabled: true },
  { name: 'planning', model: 'claude-opus-4-6', thinking_level: 'high', enabled: true },
  { name: 'coding',   model: 'claude-opus-4-6', thinking_level: 'high', enabled: true },
  { name: 'qa',       model: 'claude-opus-4-6', thinking_level: 'high', enabled: true },
];

interface Props {
  open: boolean;
  projectSlug: string;
  epics: Epic[];
  defaultEpicId?: number;
  defaultStatus?: TaskStatus;
  onClose: () => void;
  onCreated: () => void;
}

export function TaskForm({ open, projectSlug, epics, defaultEpicId, defaultStatus, onClose, onCreated }: Props) {
  const [description, setDescription] = useState('');
  const [title, setTitle] = useState('');
  const [epicId, setEpicId] = useState<number>(defaultEpicId ?? epics[0]?.id ?? 0);
  const [agentProfile, setAgentProfile] = useState('auto');
  const [phases, setPhases] = useState<PhaseConfig[]>(DEFAULT_PHASES);
  const [category, setCategory] = useState('');
  const [complexity, setComplexity] = useState('');
  const [useWorktree, setUseWorktree] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const descRef = useRef<HTMLTextAreaElement>(null);

  // Reset form on open
  useEffect(() => {
    if (open) {
      setDescription('');
      setTitle('');
      setEpicId(defaultEpicId ?? epics[0]?.id ?? 0);
      setAgentProfile('auto');
      setPhases(DEFAULT_PHASES);
      setCategory('');
      setComplexity('');
      setUseWorktree(true);
      setError('');
      setTimeout(() => descRef.current?.focus(), 50);
    }
  }, [open, defaultEpicId, epics]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const desc = description.trim();
    if (!desc) { setError('Description is required'); return; }
    if (!epicId) { setError('Select an epic'); return; }
    setSubmitting(true);
    setError('');
    try {
      const trimmedTitle = title.trim() || undefined;
      await api.tasks.create(projectSlug, epicId, {
        title: trimmedTitle ?? desc.split('\n')[0].slice(0, 80),
        description: desc,
        agent_profile: agentProfile,
        phase_config: phases,
        category: category || undefined,
        complexity: complexity || undefined,
        use_worktree: useWorktree,
        auto_title: !trimmedTitle,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            className="fixed top-4 left-1/2 z-[70] flex max-h-[calc(100vh-32px)] w-[95vw] max-w-3xl -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl"
          >
            {/* Header */}
            <div className="flex shrink-0 items-start justify-between border-b border-[var(--border-subtle)] px-6 py-4">
              <div>
                <h2 className="m-0 text-base font-semibold text-[var(--text-primary)]">Create New Task</h2>
                <p className="m-0 mt-0.5 text-xs text-[var(--text-muted)]">
                  Describe what you want to build. The AI will analyze your request and create a detailed specification.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="ml-4 cursor-pointer rounded border-none bg-transparent p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                aria-label="Close dialog"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <form id="task-form" onSubmit={handleSubmit} className="flex flex-col gap-4">

                {/* Isolated Workspace Banner */}
                <InfoBanner
                  variant="teal"
                  title="Isolated Workspace"
                  message="This task runs in an isolated git worktree. Your main branch stays safe until you choose to merge."
                  toggle={{
                    enabled: useWorktree,
                    onToggle: setUseWorktree,
                    label: useWorktree ? 'Disable worktree isolation' : 'Enable worktree isolation',
                  }}
                />

                {/* Description (required) */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-[var(--text-primary)]">
                    Description <span className="text-[var(--destructive)]">*</span>
                  </label>
                  <textarea
                    ref={descRef}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Describe the feature, bug fix, or improvement you want to implement. Be as specific as possible about requirements, constraints, and expected behavior. Type @ to reference files."
                    rows={6}
                    className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2.5 font-[inherit] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition-colors focus:border-[var(--accent)]"
                    style={{ minHeight: 120 }}
                  />
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Tip: Paste screenshots directly with ⌘V to add reference images.
                  </p>
                </div>

                {/* Reference Images (collapsible) */}
                <CollapsibleSection title="Reference Images" badge="optional">
                  <div className="flex h-16 items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-base)] text-xs text-[var(--text-muted)]">
                    Drag &amp; drop images or paste with ⌘V
                  </div>
                </CollapsibleSection>

                {/* Task Title (optional) */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-[var(--text-primary)]">
                    Task Title{' '}
                    <span className="font-normal text-[var(--text-muted)]">(Optional)</span>
                  </label>
                  <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Leave empty to auto-generate from description"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 font-[inherit] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition-colors focus:border-[var(--accent)]"
                  />
                  <p className="text-[11px] text-[var(--text-muted)]">
                    A short, descriptive title will be generated automatically if left empty.
                  </p>
                </div>

                {/* Epic selector — only shown when there are multiple epics */}
                {epics.length > 1 && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-[var(--text-muted)]">Epic</label>
                    <select
                      value={epicId}
                      onChange={e => setEpicId(Number(e.target.value))}
                      className="w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 font-[inherit] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    >
                      {epics.map(ep => <option key={ep.id} value={ep.id}>{ep.name}</option>)}
                    </select>
                  </div>
                )}

                {/* Agent Profile */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-[var(--text-primary)]">Agent Profile</label>
                  <AgentProfileSelect value={agentProfile} onChange={setAgentProfile} />
                </div>

                {/* Phase Configuration (collapsible) */}
                <CollapsibleSection
                  title="Phase Configuration"
                  icon={<Pencil size={12} className="text-[var(--text-muted)]" />}
                >
                  <PhaseConfigGrid phases={phases} onChange={setPhases} />
                </CollapsibleSection>

                {/* Classification (collapsible) */}
                <CollapsibleSection title="Classification" badge="optional">
                  <ClassificationFields
                    category={category}
                    complexity={complexity}
                    onCategoryChange={setCategory}
                    onComplexityChange={setComplexity}
                  />
                </CollapsibleSection>

                {/* Error */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-lg bg-[var(--destructive)]/[0.08] px-3 py-2 text-xs text-[var(--destructive)]"
                  >
                    {error}
                  </motion.div>
                )}
              </form>
            </div>

            {/* Footer */}
            <div className="flex shrink-0 items-center justify-between border-t border-[var(--border-subtle)] px-6 py-3">
              <button
                type="button"
                className="flex cursor-pointer items-center gap-1.5 rounded-md border-none bg-transparent px-2 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
              >
                <FolderOpen size={13} />
                Browse Files
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="cursor-pointer rounded-lg border border-[var(--border)] bg-transparent px-4 py-2 text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="task-form"
                  disabled={submitting}
                  className={cn(
                    'rounded-lg border-none px-5 py-2 text-[13px] font-semibold transition-colors',
                    'bg-[var(--cta-bg)] text-[var(--cta-text)]',
                    submitting ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-[var(--cta-bg-hover)]',
                  )}
                >
                  {submitting ? 'Creating…' : 'Create Task'}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
