// Architecture layer diagram for the "How It Works" docs page.
// Server component — no interactivity needed.

const EyeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
  </svg>
);

const GraphIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

const KanbanIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M9 3v18M15 3v12" />
  </svg>
);

const ChatIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const surfaces = [
  { name: 'Observatory', desc: 'Session telemetry · tool call timeline · usage trends', icon: <EyeIcon /> },
  { name: 'Memory', desc: 'Persistent knowledge graph across every tool and session', icon: <GraphIcon /> },
  { name: 'Board', desc: 'AI-native Kanban — agents pick up cards, you review', icon: <KanbanIcon /> },
  { name: 'AI Chat', desc: 'Terminal-style chat with Ollama support and 12 built-in tools', icon: <ChatIcon /> },
];

const pluginParts = [
  { name: 'SKILL.md', desc: 'Workflow definition — what Claude reads at invocation', accent: true },
  { name: 'agents/', desc: 'Specialist subagents — isolated workers with scoped tools' },
  { name: 'hooks/', desc: 'Lifecycle events — Stop, PreTool, PostTool, etc.' },
  { name: 'scripts/', desc: 'Shell automation bundled with the plugin' },
];

const cliOps = [
  { cmd: 'validate', desc: 'Check harness.yaml against the schema' },
  { cmd: 'compile', desc: 'Build native configs for Claude Code, Cursor, Copilot' },
  { cmd: 'sync', desc: 'Pull latest plugin changes from the registry' },
  { cmd: 'scan', desc: 'Security audit — flag unsafe skill content' },
];

const aiTools = ['Claude Code', 'Cursor', 'GitHub Copilot', 'Windsurf', 'Zed'];

const layerLabelStyle: React.CSSProperties = {
  fontSize: '9px',
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--fg-subtle, #6b7280)',
  marginBottom: '10px',
};

const layerBoxBase: React.CSSProperties = {
  borderRadius: '12px',
  padding: '16px',
};

const accentLayer: React.CSSProperties = {
  ...layerBoxBase,
  border: '1px solid rgba(34,177,236,0.35)',
  background: 'rgba(34,177,236,0.04)',
};

const mutedLayer: React.CSSProperties = {
  ...layerBoxBase,
  border: '1px solid var(--border-base, rgba(255,255,255,0.07))',
  background: 'var(--bg-surface, #12151c)',
};

const connectorStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '28px',
  gap: '6px',
  color: 'rgba(34,177,236,0.5)',
  fontSize: '11px',
};

export function ArchitectureDiagram() {
  return (
    <div className="not-prose my-8 space-y-0" style={{ fontFamily: 'var(--font-body, system-ui, sans-serif)' }}>

      {/* ── Desktop App ── */}
      <div style={accentLayer}>
        <div style={layerLabelStyle}>Desktop App</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
          {surfaces.map((s) => (
            <div
              key={s.name}
              style={{
                borderRadius: '8px',
                padding: '10px 12px',
                background: 'rgba(13,16,22,0.8)',
                border: '1px solid rgba(34,177,236,0.18)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '5px', color: 'var(--accent, #22b1ec)' }}>
                {s.icon}
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--fg-base, #e8eaf0)' }}>{s.name}</span>
              </div>
              <p style={{ fontSize: '10px', lineHeight: 1.5, color: 'var(--fg-muted, #9aa0ad)', margin: 0 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* connector */}
      <div style={connectorStyle}>
        <svg width="1" height="20" viewBox="0 0 1 20" aria-hidden="true">
          <line x1="0.5" y1="0" x2="0.5" y2="20" stroke="rgba(34,177,236,0.4)" strokeWidth="1.5" strokeDasharray="3 2" />
        </svg>
        <span style={{ color: 'rgba(34,177,236,0.5)', fontSize: '10px' }}>reads · writes · syncs</span>
        <svg width="1" height="20" viewBox="0 0 1 20" aria-hidden="true">
          <line x1="0.5" y1="0" x2="0.5" y2="20" stroke="rgba(34,177,236,0.4)" strokeWidth="1.5" strokeDasharray="3 2" />
        </svg>
      </div>

      {/* ── harness.yaml ── */}
      <div style={{ ...accentLayer, border: '1.5px solid rgba(34,177,236,0.45)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ ...layerLabelStyle, marginBottom: 0 }}>Config Core</div>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent, #22b1ec)', fontFamily: 'var(--font-mono, monospace)' }}>harness.yaml</span>
        </div>
        <div
          style={{
            background: 'rgba(13,16,22,0.9)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '8px',
            padding: '12px 16px',
            fontFamily: 'var(--font-mono, Menlo, monospace)',
            fontSize: '11px',
            lineHeight: 1.8,
            color: '#6b7280',
          }}
        >
          <span style={{ color: '#9aa0ad' }}>sources:</span>{'\n'}
          {'  '}<span style={{ color: '#5a6270' }}>- harnessprotocol/harness-kit</span>{'\n'}
          <span style={{ color: '#9aa0ad' }}>plugins:</span>{'\n'}
          {'  '}<span style={{ color: '#5a6270' }}>- research@0.2.0  # SKILL.md + scripts bundled</span>{'\n'}
          {'  '}<span style={{ color: '#5a6270' }}>- board@0.1.0     # SKILL.md + MCP server</span>{'\n'}
          <span style={{ color: '#9aa0ad' }}>mcp-servers:</span>{'\n'}
          {'  '}<span style={{ color: '#5a6270' }}>- memory           # knowledge graph</span>{'\n'}
          {'  '}<span style={{ color: '#5a6270' }}>- filesystem       # local file access</span>
        </div>
      </div>

      {/* connector */}
      <div style={{ ...connectorStyle, justifyContent: 'space-around' }}>
        <span style={{ color: 'rgba(34,177,236,0.4)', fontSize: '10px' }}>↙ installs &amp; manages</span>
        <span style={{ color: 'rgba(34,177,236,0.4)', fontSize: '10px' }}>validates &amp; compiles ↘</span>
      </div>

      {/* ── Plugin System + CLI ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>

        {/* Plugin System */}
        <div style={mutedLayer}>
          <div style={layerLabelStyle}>Plugin System</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {pluginParts.map((p) => (
              <div
                key={p.name}
                style={{
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'flex-start',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  background: 'rgba(13,16,22,0.5)',
                  border: p.accent ? '1px solid rgba(34,177,236,0.25)' : '1px solid transparent',
                }}
              >
                <code style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  color: p.accent ? 'var(--accent, #22b1ec)' : 'var(--fg-base, #e8eaf0)',
                  background: 'none',
                  padding: 0,
                  minWidth: '68px',
                }}>
                  {p.name}
                </code>
                <span style={{ fontSize: '10px', color: 'var(--fg-muted, #9aa0ad)', lineHeight: 1.4 }}>{p.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CLI */}
        <div style={mutedLayer}>
          <div style={layerLabelStyle}>CLI — harness-kit</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {cliOps.map((op) => (
              <div
                key={op.cmd}
                style={{
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'flex-start',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  background: 'rgba(13,16,22,0.5)',
                  border: '1px solid transparent',
                }}
              >
                <code style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  color: 'var(--fg-base, #e8eaf0)',
                  background: 'none',
                  padding: 0,
                  minWidth: '60px',
                }}>
                  {op.cmd}
                </code>
                <span style={{ fontSize: '10px', color: 'var(--fg-muted, #9aa0ad)', lineHeight: 1.4 }}>{op.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* connector */}
      <div style={connectorStyle}>
        <svg width="1" height="20" viewBox="0 0 1 20" aria-hidden="true">
          <line x1="0.5" y1="0" x2="0.5" y2="20" stroke="rgba(100,100,120,0.4)" strokeWidth="1.5" strokeDasharray="3 2" />
        </svg>
        <span style={{ color: 'rgba(100,100,120,0.6)', fontSize: '10px' }}>runs in</span>
        <svg width="1" height="20" viewBox="0 0 1 20" aria-hidden="true">
          <line x1="0.5" y1="0" x2="0.5" y2="20" stroke="rgba(100,100,120,0.4)" strokeWidth="1.5" strokeDasharray="3 2" />
        </svg>
      </div>

      {/* ── AI Tools ── */}
      <div style={{ ...mutedLayer, border: '1px solid var(--border-base, rgba(255,255,255,0.07))' }}>
        <div style={layerLabelStyle}>AI Tools</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {aiTools.map((tool) => (
            <span
              key={tool}
              style={{
                fontSize: '11px',
                fontWeight: 500,
                padding: '4px 10px',
                borderRadius: '6px',
                background: 'rgba(13,16,22,0.6)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--fg-muted, #9aa0ad)',
              }}
            >
              {tool}
            </span>
          ))}
          <span style={{
            fontSize: '11px',
            padding: '4px 10px',
            borderRadius: '6px',
            color: 'var(--fg-subtle, #6b7280)',
          }}>
            + any tool that reads markdown
          </span>
        </div>
      </div>

    </div>
  );
}
