import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/board-api';
import type { Project } from '../../lib/board-api';

export default function BoardProjectsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.projects.list()
      .then(list => {
        if (list.length === 1) {
          navigate(`/board/${list[0].slug}`, { replace: true });
        } else if (list.length > 1) {
          setProjects(list);
          setLoading(false);
        } else {
          setProjects([]);
          setLoading(false);
        }
      })
      .catch(err => {
        setError(String(err));
        setLoading(false);
      });
  }, [navigate]);

  if (loading) {
    return (
      <div className="board-scope" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="board-scope" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: 32 }}>{'\u26A0\uFE0F'}</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          Could not connect to board server
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          Start it with: pnpm --filter board-server dev
        </span>
      </div>
    );
  }

  // Multiple projects — show picker
  if (projects.length > 1) {
    return (
      <div className="board-scope" style={{ padding: 32, maxWidth: 600, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 20 }}>
          Projects
        </h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {projects.map(p => (
            <button
              key={p.slug}
              onClick={() => navigate(`/board/${p.slug}`)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'border-color 0.1s, background 0.1s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)';
                (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)';
                (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)';
              }}
            >
              {p.color && (
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                {p.description && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{p.description}</div>
                )}
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {p.epics.reduce((n, e) => n + e.tasks.length, 0)} tasks
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // No projects
  return (
    <div className="board-scope" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ color: 'var(--text-primary)', fontSize: 20, fontWeight: 600, margin: 0 }}>
        No projects yet
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0, textAlign: 'center', maxWidth: 320 }}>
        Create a project with an MCP tool call or from the board server:
      </p>
      <code style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '8px 16px',
        fontSize: 13,
        color: 'var(--text-secondary)',
        fontFamily: 'monospace',
      }}>
        create_project(name: "My Project")
      </code>
    </div>
  );
}
