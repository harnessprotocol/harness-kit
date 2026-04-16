'use client';

import { useState } from 'react';
import styles from './DesktopMock.module.css';

type SectionId = 'harness' | 'marketplace' | 'observatory' | 'agents' | 'comparator' | 'security' | 'parity' | 'board' | 'roadmap' | 'ai-chat' | 'memory';

interface DesktopMockProps {
  interactive?: boolean;
  defaultSection?: SectionId;
  compact?: boolean;
}

const SECTIONS = [
  {
    group: 'CORE',
    items: [
      {
        id: 'harness',
        label: 'Harness',
        title: 'Harness — harness.yaml',
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        id: 'marketplace',
        label: 'Marketplace',
        title: 'Marketplace',
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3z" />
          </svg>
        ),
      },
    ],
  },
  {
    group: 'INSIGHTS',
    items: [
      {
        id: 'observatory',
        label: 'Observatory',
        title: 'Observatory',
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
          </svg>
        ),
      },
      {
        id: 'agents',
        label: 'Agents',
        title: 'Agents',
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        ),
      },
      {
        id: 'comparator',
        label: 'Comparator',
        title: 'Comparator',
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path d="M3 4a1 1 0 000 2h11.586l-2.293 2.293a1 1 0 001.414 1.414l4-4a1 1 0 000-1.414l-4-4a1 1 0 10-1.414 1.414L14.586 4H3zM17 16a1 1 0 000-2H5.414l2.293-2.293a1 1 0 00-1.414-1.414l-4 4a1 1 0 000 1.414l4 4a1 1 0 001.414-1.414L5.414 16H17z" />
          </svg>
        ),
      },
    ],
  },
  {
    group: 'SYSTEM',
    items: [
      {
        id: 'security',
        label: 'Security',
        title: 'Security — Permissions',
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        id: 'parity',
        label: 'Parity',
        title: 'Parity — Cross-harness',
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
            <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm9.707 5.707a1 1 0 00-1.414-1.414L9 12.586l-1.293-1.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        ),
      },
    ],
  },
  {
    group: 'WORKFLOWS',
    items: [
      {
        id: 'board',
        label: 'Board',
        title: 'Board',
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 4a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H3a1 1 0 01-1-1V4zM3 9a1 1 0 000 2h6a1 1 0 000-2H3zM3 14a1 1 0 000 2h6a1 1 0 000-2H3zM14 9a1 1 0 000 2h3a1 1 0 000-2h-3zM14 14a1 1 0 000 2h3a1 1 0 000-2h-3z" />
          </svg>
        ),
      },
      {
        id: 'roadmap',
        label: 'Roadmap',
        title: 'Roadmap',
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        id: 'ai-chat',
        label: 'AI Chat',
        title: 'AI Chat',
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
            <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
          </svg>
        ),
      },
      {
        id: 'memory',
        label: 'Memory',
        title: 'Memory — Graph',
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
          </svg>
        ),
      },
    ],
  },
];

// Flatten all items for lookup
const ALL_ITEMS = SECTIONS.flatMap((g) => g.items);

function getTitleForSection(id: SectionId) {
  return ALL_ITEMS.find((i) => i.id === id)?.title ?? 'Harness Kit';
}

export function DesktopMock({
  interactive = true,
  defaultSection = 'observatory',
  compact = false,
}: DesktopMockProps) {
  const [activeSection, setActiveSection] = useState(defaultSection);

  const frameClass = [styles.frame, compact ? styles.compact : ''].filter(Boolean).join(' ');

  const handleItemClick = (id: SectionId) => {
    if (interactive) setActiveSection(id);
  };

  return (
    <div className={frameClass} role="presentation" aria-hidden="true">
      {/* Title bar */}
      <div className={styles.titlebar}>
        <span className={`${styles.tl} ${styles.tlRed}`} />
        <span className={`${styles.tl} ${styles.tlYellow}`} />
        <span className={`${styles.tl} ${styles.tlGreen}`} />
        <span className={styles.titleText}>
          Harness Kit — {getTitleForSection(activeSection)}
        </span>
        {interactive && (
          <span className={styles.hintText}>click the sidebar →</span>
        )}
      </div>

      {/* Body */}
      <div className={styles.body}>
        {/* Sidebar */}
        <aside className={styles.sidebar}>
          {SECTIONS.map((group) => (
            <div key={group.group}>
              <div className={styles.groupHeader}>{group.group}</div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  className={`${styles.item} ${activeSection === item.id ? styles.itemActive : ''}`}
                  onClick={() => handleItemClick(item.id as SectionId)}
                  aria-pressed={activeSection === item.id}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </aside>

        {/* Content panes */}
        <div className={styles.paneWrap}>
          {/* Observatory */}
          <div className={`${styles.pane} ${activeSection === 'observatory' ? styles.paneActive : ''}`}>
            <div className={styles.paneTitle}>Observatory</div>
            <div className={styles.paneSubtitle}>This week · all tools</div>
            <div className={styles.metricRow}>
              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Sessions</div>
                <div className={styles.metricValue}>1,247</div>
                <div className={styles.metricDelta}>+12.4% wk</div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Tool calls</div>
                <div className={styles.metricValue}>8,390</div>
                <div className={styles.metricDelta}>+6.1% wk</div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Avg duration</div>
                <div className={styles.metricValue}>34m</div>
                <div className={styles.metricDelta}>−2m wk</div>
              </div>
            </div>
            <div className={styles.chartCard}>
              <div className={styles.chartHeader}>
                <div className={styles.chartTitle}>Sessions over time</div>
                <div className={styles.chartLegend}>7d · 30d · 90d</div>
              </div>
              <svg className={styles.chartSvg} viewBox="0 0 400 140" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="dm-lg1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22b1ec" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#22b1ec" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0,110 L30,95 L60,100 L90,80 L120,85 L150,60 L180,65 L210,45 L240,55 L270,35 L300,40 L330,25 L360,30 L400,15 L400,140 L0,140 Z" fill="url(#dm-lg1)" />
                <path d="M0,110 L30,95 L60,100 L90,80 L120,85 L150,60 L180,65 L210,45 L240,55 L270,35 L300,40 L330,25 L360,30 L400,15" fill="none" stroke="#22b1ec" strokeWidth="2" />
                <circle cx="400" cy="15" r="3.5" fill="#22b1ec" />
              </svg>
            </div>
          </div>

          {/* Harness */}
          <div className={`${styles.pane} ${styles.paneHarness} ${activeSection === 'harness' ? styles.paneActive : ''}`}>
            <pre className={styles.paneHarnessCode}>
              <span className={styles.yamlComment}># harness.yaml — the one file that travels with you</span>{'\n'}
              <span className={styles.yamlKey}>version:</span> <span className={styles.yamlNum}>1</span>{'\n\n'}
              <span className={styles.yamlKey}>plugins:</span>{'\n'}
              {'  '}<span className={styles.yamlDash}>-</span> <span className={styles.yamlStr}>research@harness-kit</span>{'\n'}
              {'  '}<span className={styles.yamlDash}>-</span> <span className={styles.yamlStr}>orient@harness-kit</span>{'\n'}
              {'  '}<span className={styles.yamlDash}>-</span> <span className={styles.yamlStr}>explain@harness-kit</span>{'\n'}
              {'  '}<span className={styles.yamlDash}>-</span> <span className={styles.yamlStr}>review@harness-kit</span>{'\n\n'}
              <span className={styles.yamlKey}>mcp:</span>{'\n'}
              {'  '}<span className={styles.yamlDash}>-</span> <span className={styles.yamlStr}>filesystem</span>{'\n'}
              {'  '}<span className={styles.yamlDash}>-</span> <span className={styles.yamlStr}>memory</span>{'\n'}
              {'  '}<span className={styles.yamlDash}>-</span> <span className={styles.yamlStr}>grafana</span>{'\n\n'}
              <span className={styles.yamlKey}>hooks:</span>{'\n'}
              {'  '}<span className={styles.yamlKey}>pre-commit:</span> <span className={styles.yamlStr}>/review</span>{'\n'}
              {'  '}<span className={styles.yamlKey}>pre-push:</span>{'   '}<span className={styles.yamlStr}>/test</span>{'\n\n'}
              <span className={styles.yamlKey}>skills:</span>{'\n'}
              {'  '}<span className={styles.yamlDash}>-</span> <span className={styles.yamlStr}>brainstorming</span>{'\n'}
              {'  '}<span className={styles.yamlDash}>-</span> <span className={styles.yamlStr}>debugging</span>{'\n'}
              {'  '}<span className={styles.yamlDash}>-</span> <span className={styles.yamlStr}>writing-plans</span>
            </pre>
          </div>

          {/* Marketplace */}
          <div className={`${styles.pane} ${activeSection === 'marketplace' ? styles.paneActive : ''}`}>
            <div className={styles.paneTitle}>Marketplace</div>
            <div className={styles.mpSearch}>
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
              Search plugins…
            </div>
            <div className={styles.pluginGridMock}>
              {[
                { name: 'research', desc: 'Structured knowledge base from any source.' },
                { name: 'orient', desc: 'Topic-focused session orientation.' },
                { name: 'explain', desc: 'Layered explanations of files and concepts.' },
                { name: 'review', desc: 'Cross-file code review with severity labels.' },
                { name: 'data-lineage', desc: 'Column-level tracing through SQL and Kafka.' },
                { name: 'capture-session', desc: 'Save session state for later reflection.' },
              ].map((p) => (
                <div key={p.name} className={styles.pluginTile}>
                  <div className={styles.pluginTileName}>{p.name}</div>
                  <div className={styles.pluginTileDesc}>{p.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Agents */}
          <div className={`${styles.pane} ${activeSection === 'agents' ? styles.paneActive : ''}`}>
            <div className={styles.paneTitle}>Agents</div>
            <div className={styles.paneSubtitle}>4 running · 2 idle</div>
            <div className={styles.agentGrid}>
              {[
                { name: 'code-reviewer', status: 'reviewing feat/auth-rewrite · 3 files', running: true },
                { name: 'doc-updater', status: 'checking API ref drift', running: true },
                { name: 'test-writer', status: 'idle · last ran 4m ago', running: false },
                { name: 'commit-crafter', status: 'drafting message', running: true },
                { name: 'memory-updater', status: 'idle · waiting for hook', running: false },
                { name: 'parity-checker', status: 'Cursor vs Claude', running: true },
              ].map((agent) => (
                <div key={agent.name} className={styles.agentCard}>
                  <div className={`${styles.agentDot} ${agent.running ? styles.agentDotRunning : styles.agentDotIdle}`} />
                  <div>
                    <div className={styles.agentName}>{agent.name}</div>
                    <div className={`${styles.agentStatus} ${agent.running ? styles.agentStatusRunning : ''}`}>
                      {agent.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Comparator */}
          <div className={`${styles.pane} ${styles.comparatorPane} ${activeSection === 'comparator' ? styles.paneActive : ''}`}>
            <div className={styles.term}>
              <div className={styles.termHeader}>Claude Code</div>
              <div className={styles.termLine}><span className={styles.termUser}>&gt; fix the auth token refresh race</span></div>
              <div className={styles.termLine}><span className={styles.termTool}>→ read src/auth/refresh.ts</span></div>
              <div className={styles.termLine}><span className={styles.termTool}>→ read tests/auth.test.ts</span></div>
              <div className={styles.termLine}>Found: await missing on line 47</div>
              <div className={styles.termLine}>Patching auth.ts…</div>
              <div className={styles.termLine}><span className={styles.termOk}>✓ tests passing (12/12)</span></div>
              <div className={`${styles.termLine} ${styles.termCursor}`}>ready</div>
            </div>
            <div className={styles.term}>
              <div className={styles.termHeader}>Cursor</div>
              <div className={styles.termLine}><span className={styles.termUser}>&gt; fix the auth token refresh race</span></div>
              <div className={styles.termLine}><span className={styles.termTool}>→ grep "refresh" src/</span></div>
              <div className={styles.termLine}><span className={styles.termTool}>→ open auth/refresh.ts</span></div>
              <div className={styles.termLine}>Issue: token stored before fetch</div>
              <div className={styles.termLine}>Proposing refactor…</div>
              <div className={`${styles.termLine} ${styles.termCursor}`}>running tests</div>
            </div>
          </div>

          {/* Security */}
          <div className={`${styles.pane} ${activeSection === 'security' ? styles.paneActive : ''}`}>
            <div className={styles.paneTitle}>Permissions</div>
            <div className={styles.paneSubtitle}>Claude Code · auto-allow rules</div>
            <div className={styles.permTable}>
              {[
                { status: 'allow', rule: 'Bash(pnpm *)' },
                { status: 'allow', rule: 'Read(~/repos/**)' },
                { status: 'allow', rule: 'WebFetch(api.github.com)' },
                { status: 'ask',   rule: 'Bash(git push origin *)' },
                { status: 'ask',   rule: 'Write(~/.zshrc)' },
                { status: 'deny',  rule: 'Read(~/.ssh/**)' },
                { status: 'deny',  rule: 'Bash(rm -rf /**)' },
              ].map((row, i) => (
                <div key={i} className={styles.permRow}>
                  <span className={`${styles.permStatus} ${row.status === 'allow' ? styles.permAllow : row.status === 'ask' ? styles.permAsk : styles.permDeny}`}>
                    {row.status}
                  </span>
                  <span className={styles.permRule}>{row.rule}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Parity */}
          <div className={`${styles.pane} ${activeSection === 'parity' ? styles.paneActive : ''}`}>
            <div className={styles.paneTitle}>Cross-harness parity</div>
            <div className={styles.paneSubtitle}>What runs where, right now</div>
            <table className={styles.parityTable}>
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>Plugins</th>
                  <th>MCP</th>
                  <th>Hooks</th>
                  <th>Skills</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { tool: 'Claude Code', plugins: '✓', mcp: '✓', hooks: '✓', skills: '✓' },
                  { tool: 'Cursor',      plugins: '✓', mcp: '✓', hooks: '—', skills: '◐' },
                  { tool: 'Copilot',     plugins: '✓', mcp: '—', hooks: '—', skills: '◐' },
                  { tool: 'Windsurf',    plugins: '◐', mcp: '—', hooks: '—', skills: '—' },
                ].map((row) => (
                  <tr key={row.tool}>
                    <td>{row.tool}</td>
                    <td><span className={row.plugins === '✓' ? styles.parityCheck : row.plugins === '◐' ? styles.parityPartial : styles.parityNone}>{row.plugins}</span></td>
                    <td><span className={row.mcp === '✓' ? styles.parityCheck : row.mcp === '◐' ? styles.parityPartial : styles.parityNone}>{row.mcp}</span></td>
                    <td><span className={row.hooks === '✓' ? styles.parityCheck : row.hooks === '◐' ? styles.parityPartial : styles.parityNone}>{row.hooks}</span></td>
                    <td><span className={row.skills === '✓' ? styles.parityCheck : row.skills === '◐' ? styles.parityPartial : styles.parityNone}>{row.skills}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Board */}
          <div className={`${styles.pane} ${activeSection === 'board' ? styles.paneActive : ''}`}>
            <div className={styles.paneTitle}>Board</div>
            <div className={styles.paneSubtitle}>harness-kit · feat/docs-revamp</div>
            <div className={styles.boardCols}>
              <div className={styles.boardCol}>
                <div className={styles.boardColTitle}>
                  Backlog <span className={styles.boardColCount}>4</span>
                </div>
                <div className={styles.boardCard}><span className={`${styles.boardTag} ${styles.boardTagFeat}`}>feat</span><div>Memory v2 — edge weights</div></div>
                <div className={styles.boardCard}><span className={`${styles.boardTag} ${styles.boardTagFix}`}>fix</span><div>YAML colon-space escape</div></div>
                <div className={styles.boardCard}><span className={`${styles.boardTag} ${styles.boardTagDocs}`}>docs</span><div>Add Windsurf setup guide</div></div>
                <div className={styles.boardCard}><span className={`${styles.boardTag} ${styles.boardTagChore}`}>chore</span><div>Bump Tauri to 2.4</div></div>
              </div>
              <div className={styles.boardCol}>
                <div className={styles.boardColTitle}>
                  In progress <span className={styles.boardColCount}>2</span>
                </div>
                <div className={styles.boardCard}><span className={`${styles.boardTag} ${styles.boardTagFeat}`}>feat</span><div>Docs revamp — hero + explainer</div></div>
                <div className={styles.boardCard}><span className={`${styles.boardTag} ${styles.boardTagFix}`}>fix</span><div>Auth token refresh race</div></div>
              </div>
              <div className={styles.boardCol}>
                <div className={styles.boardColTitle}>
                  Done <span className={styles.boardColCount}>3</span>
                </div>
                <div className={styles.boardCard}><span className={`${styles.boardTag} ${styles.boardTagFeat}`}>feat</span><div>Explore hub · 11 surfaces</div></div>
                <div className={styles.boardCard}><span className={`${styles.boardTag} ${styles.boardTagFeat}`}>feat</span><div>Cyan-blue palette rollout</div></div>
                <div className={styles.boardCard}><span className={`${styles.boardTag} ${styles.boardTagDocs}`}>docs</span><div>FAQ rewrite</div></div>
              </div>
            </div>
          </div>

          {/* Roadmap */}
          <div className={`${styles.pane} ${activeSection === 'roadmap' ? styles.paneActive : ''}`}>
            <div className={styles.paneTitle}>Roadmap</div>
            <div className={styles.paneSubtitle}>harness-kit · 2026</div>
            {[
              { label: "Q1 '26", pct: 100, planned: false, status: 'shipped',     cls: styles.roadmapStatusLive },
              { label: "Q2 '26", pct: 62,  planned: false, status: 'in progress', cls: styles.roadmapStatusBuilding },
              { label: "Q3 '26", pct: 18,  planned: true,  status: 'planned',     cls: '' },
              { label: "Q4 '26", pct: 5,   planned: true,  status: 'ideas',       cls: '' },
            ].map((row) => (
              <div key={row.label} className={styles.roadmapRow}>
                <div className={styles.roadmapLabel}>{row.label}</div>
                <div className={styles.roadmapBar}>
                  <div
                    className={`${styles.roadmapFill} ${row.planned ? styles.roadmapFillPlanned : ''}`}
                    style={{ width: `${row.pct}%` }}
                  />
                </div>
                <div className={`${styles.roadmapStatus} ${row.cls}`}>{row.status}</div>
              </div>
            ))}
          </div>

          {/* AI Chat */}
          <div className={`${styles.pane} ${activeSection === 'ai-chat' ? styles.paneActive : ''}`}>
            <div className={`${styles.chatMsg} ${styles.chatMsgUser}`}>what&apos;s in my harness right now?</div>
            <div className={`${styles.chatMsg} ${styles.chatMsgBot}`}>4 plugins, 3 MCP servers, 2 hooks, 3 skills — want me to list them?</div>
            <div className={`${styles.chatMsg} ${styles.chatMsgUser}`}>yeah. also add review plugin</div>
            <div className={`${styles.chatMsg} ${styles.chatMsgBot}`}>
              installed <code style={{ fontSize: 11, padding: '1px 5px' }}>review@harness-kit</code>. harness.yaml updated. here&apos;s the full list:<br /><br />
              plugins: research, orient, explain, review<br />
              mcp: filesystem, memory, grafana<br />
              hooks: pre-commit, pre-push
            </div>
            <div className={`${styles.chatMsg} ${styles.chatMsgUser}`}>commit it</div>
            <div className={`${styles.chatMsg} ${styles.chatMsgBot}`}>drafting commit message…</div>
          </div>

          {/* Memory */}
          <div className={`${styles.pane} ${activeSection === 'memory' ? styles.paneActive : ''}`} style={{ position: 'relative' }}>
            <div className={styles.memoryGraphBg} />
            <div className={styles.memoryNodes}>
              {/* SVG edges — rendered before nodes so they appear behind */}
              <svg
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                aria-hidden="true"
              >
                {/* harness → plugin */}
                <line x1="18%" y1="15%" x2="58%" y2="12%" stroke="rgba(148,163,184,0.35)" strokeWidth="1" />
                {/* harness → skill */}
                <line x1="18%" y1="15%" x2="36%" y2="42%" stroke="rgba(148,163,184,0.35)" strokeWidth="1" />
                {/* plugin → skill */}
                <line x1="58%" y1="12%" x2="36%" y2="42%" stroke="rgba(148,163,184,0.35)" strokeWidth="1" />
                {/* skill → MCP */}
                <line x1="36%" y1="42%" x2="72%" y2="48%" stroke="rgba(34,177,236,0.40)" strokeWidth="1" />
                {/* skill → hook */}
                <line x1="36%" y1="42%" x2="12%" y2="68%" stroke="rgba(168,85,247,0.35)" strokeWidth="1" />
                {/* skill → CLAUDE.md */}
                <line x1="36%" y1="42%" x2="50%" y2="72%" stroke="rgba(16,185,129,0.35)" strokeWidth="1" />
              </svg>
              <div className={styles.memoryNode} style={{ left: '18%', top: '15%' }}>harness</div>
              <div className={`${styles.memoryNode} ${styles.memoryNodeAltC}`} style={{ left: '58%', top: '12%' }}>plugin</div>
              <div className={styles.memoryNode} style={{ left: '36%', top: '42%' }}>skill</div>
              <div className={`${styles.memoryNode} ${styles.memoryNodeAltA}`} style={{ left: '72%', top: '48%' }}>MCP</div>
              <div className={`${styles.memoryNode} ${styles.memoryNodeAltB}`} style={{ left: '12%', top: '68%' }}>hook</div>
              <div className={`${styles.memoryNode} ${styles.memoryNodeAltC}`} style={{ left: '50%', top: '72%' }}>CLAUDE.md</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
