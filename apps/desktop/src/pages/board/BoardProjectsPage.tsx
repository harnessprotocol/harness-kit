import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/board-api';
import type { Project } from '../../lib/board-api';
import { useBoardServerReady } from '../../hooks/useBoardServerReady';
import { BoardServerOffline } from '../../components/board/BoardServerOffline';

export default function BoardProjectsPage() {
  const navigate = useNavigate();
  const serverState = useBoardServerReady();
  const { ready, timedOut } = serverState;
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    setError(null);
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
  }, [ready, navigate]);

  async function handleCreateProject(e: FormEvent) {
    e.preventDefault();
    const name = projectName.trim();
    if (!name || creating) return;

    setCreating(true);
    setCreateError(null);
    try {
      const project = await api.projects.create({
        name,
        description: projectDescription.trim() || undefined,
        color: '#0ea5e9',
      });
      navigate(`/board/${project.slug}`, { replace: true });
    } catch (err) {
      setCreateError(String(err));
    } finally {
      setCreating(false);
    }
  }

  if (timedOut) {
    return <BoardServerOffline serverState={serverState} />;
  }

  if (!ready || loading) {
    return (
      <div className="board-scope" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          {!ready ? 'Connecting to board server...' : 'Loading...'}
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="board-scope" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: 32 }}>{'\u26A0\uFE0F'}</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          Could not load projects
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{error}</span>
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
    <div className="board-scope" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100%', padding: 32 }}>
      <div style={{
        width: '100%',
        maxWidth: 560,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 24,
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--accent-text)',
            marginBottom: 8,
          }}>
            Workflow board
          </div>
          <h1 style={{ color: 'var(--text-primary)', fontSize: 20, fontWeight: 650, margin: 0 }}>
            Create your first project
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '6px 0 0', lineHeight: 1.55 }}>
            Set up a local project board for epics, tasks, roadmap conversion, and agent execution.
          </p>
        </div>

        <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>Project name</span>
            <input
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              placeholder="Enterprise demo workspace"
              autoFocus
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                fontSize: 13,
                padding: '9px 11px',
                outline: 'none',
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>Description</span>
            <textarea
              value={projectDescription}
              onChange={e => setProjectDescription(e.target.value)}
              placeholder="Portable AI coding governance, workflows, and observability."
              rows={3}
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
                fontSize: 13,
                lineHeight: 1.5,
                padding: '9px 11px',
                resize: 'vertical',
                outline: 'none',
              }}
            />
          </label>

          {createError && (
            <div style={{ color: 'var(--danger)', fontSize: 12 }}>
              {createError}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <code style={{
              color: 'var(--text-muted)',
              fontFamily: 'ui-monospace, monospace',
              fontSize: 11,
            }}>
              Local server :4800
            </code>
            <button
              type="submit"
              disabled={!projectName.trim() || creating}
              style={{
                background: projectName.trim() && !creating ? 'var(--accent)' : 'var(--border)',
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                cursor: projectName.trim() && !creating ? 'pointer' : 'not-allowed',
                fontSize: 12,
                fontWeight: 650,
                padding: '8px 16px',
                opacity: projectName.trim() && !creating ? 1 : 0.55,
              }}
            >
              {creating ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
