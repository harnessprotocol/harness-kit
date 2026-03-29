'use client';

import { useState } from 'react';
import { cn } from '../lib/utils';
import type { Comment } from '../lib/api';

interface Props {
  comments: Comment[];
  onAdd: (body: string) => Promise<void>;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function CommentThread({ comments, onAdd }: Props) {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await onAdd(trimmed);
      setBody('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Comment list */}
      {comments.length === 0 ? (
        <div className="text-[12px] italic text-[var(--text-muted)]">
          No comments yet.
        </div>
      ) : (
        comments.map((c, i) => (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'text-[11px] font-semibold uppercase tracking-[0.04em]',
                  c.author === 'claude' ? 'text-[var(--accent)]' : 'text-[var(--status-in-progress)]',
                )}
              >
                {c.author === 'claude' ? '✦ Claude' : '● You'}
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">
                {formatTime(c.timestamp)}
              </span>
            </div>
            <div className="rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2.5 py-2 text-[13px] text-[var(--text-primary)] leading-[1.5] whitespace-pre-wrap">
              {c.body}
            </div>
          </div>
        ))
      )}

      {/* Add comment form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 mt-1">
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Add a comment…"
          rows={3}
          className="rounded-[6px] border border-[var(--border)] bg-[var(--bg-base)] px-2.5 py-2 text-[13px] text-[var(--text-primary)] font-[inherit] resize-y outline-none transition-colors duration-100 focus:border-[var(--accent)]"
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e);
          }}
        />
        <button
          type="submit"
          disabled={submitting || !body.trim()}
          className={cn(
            'self-end rounded-[6px] border-none bg-[var(--accent)] px-4 py-1.5 text-[13px] font-medium text-white cursor-pointer transition-opacity duration-100',
            submitting || !body.trim() ? 'opacity-50 cursor-not-allowed' : 'opacity-100 hover:opacity-90',
          )}
        >
          {submitting ? 'Posting…' : 'Comment'}
        </button>
      </form>
    </div>
  );
}
