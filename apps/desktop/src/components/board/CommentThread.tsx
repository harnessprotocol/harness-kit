import { useState } from "react";
import type { Comment } from "../../lib/board-api";

interface Props {
  comments: Comment[];
  onAdd: (body: string) => Promise<void>;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CommentThread({ comments, onAdd }: Props) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await onAdd(trimmed);
      setBody("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Comment list */}
      {comments.length === 0 ? (
        <div style={{ color: "var(--text-muted)", fontSize: 12, fontStyle: "italic" }}>
          No comments yet.
        </div>
      ) : (
        comments.map((c, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: c.author === "claude" ? "var(--accent)" : "var(--status-in-progress)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {c.author === "claude" ? "\u2726 Claude" : "\u25CF You"}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {formatTime(c.timestamp)}
              </span>
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--text-primary)",
                lineHeight: 1.5,
                background: "var(--bg-base)",
                borderRadius: 6,
                padding: "8px 10px",
                border: "1px solid var(--border-subtle)",
                whiteSpace: "pre-wrap",
              }}
            >
              {c.body}
            </div>
          </div>
        ))
      )}

      {/* Add comment form */}
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}
      >
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment..."
          rows={3}
          style={{
            background: "var(--bg-base)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            color: "var(--text-primary)",
            fontSize: 13,
            padding: "8px 10px",
            resize: "vertical",
            fontFamily: "inherit",
            outline: "none",
            transition: "border-color 0.1s",
          }}
          onFocus={(e) => {
            (e.target as HTMLElement).style.borderColor = "var(--accent)";
          }}
          onBlur={(e) => {
            (e.target as HTMLElement).style.borderColor = "var(--border)";
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit(e);
          }}
        />
        <button
          type="submit"
          disabled={submitting || !body.trim()}
          style={{
            alignSelf: "flex-end",
            padding: "6px 16px",
            background: "var(--accent)",
            border: "none",
            borderRadius: 6,
            color: "#fff",
            fontSize: 13,
            fontWeight: 500,
            cursor: submitting || !body.trim() ? "not-allowed" : "pointer",
            opacity: submitting || !body.trim() ? 0.5 : 1,
            transition: "opacity 0.1s",
          }}
        >
          {submitting ? "Posting..." : "Comment"}
        </button>
      </form>
    </div>
  );
}
