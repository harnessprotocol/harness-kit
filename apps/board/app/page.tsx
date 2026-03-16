'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from './lib/api';
import type { Project } from './lib/api';

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    api.projects.list()
      .then(list => {
        if (list.length > 0) {
          router.replace(`/${list[0].slug}`);
        } else {
          setProjects([]);
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 40 }}>📋</div>
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
