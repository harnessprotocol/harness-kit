'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './DesktopMock.module.css';
import { getAllPlugins } from '@/lib/marketplace/data';

// Real marketplace plugins drive the mock's plugin grid (kept to 6 for layout).
const MOCK_PLUGINS = getAllPlugins()
  .slice(0, 6)
  .map((p) => ({ name: p.name, desc: p.description }));

type SectionId = 'machine' | 'profile' | 'claude-code' | 'marketplace' | 'comparator';

interface DesktopMockProps {
  interactive?: boolean;
  defaultSection?: SectionId;
  compact?: boolean;
}

// The sidebar mirrors the app: Machine, Profile, Claude Code, Marketplace, and
// Comparator under Labs (apps/desktop/src/nav.ts). The pane contents are
// illustrative sample data, not a capture of a real machine.
const SECTIONS = [
  {
    group: 'WORKSPACE',
    items: [
      {
        id: 'machine',
        label: 'Machine',
        title: 'Machine',
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M2 4.25A2.25 2.25 0 014.25 2h11.5A2.25 2.25 0 0118 4.25v8.5A2.25 2.25 0 0115.75 15h-3.105a3.501 3.501 0 001.1 1.677A.75.75 0 0113.26 18H6.74a.75.75 0 01-.484-1.323A3.501 3.501 0 007.355 15H4.25A2.25 2.25 0 012 12.75v-8.5zm1.5 0a.75.75 0 01.75-.75h11.5a.75.75 0 01.75.75v7.5a.75.75 0 01-.75.75H4.25a.75.75 0 01-.75-.75v-7.5z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        id: 'profile',
        label: 'Profile',
        title: 'Profile — harness.yaml',
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        id: 'claude-code',
        label: 'Claude Code',
        title: 'Claude Code — Permissions',
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3.25 3A2.25 2.25 0 001 5.25v9.5A2.25 2.25 0 003.25 17h13.5A2.25 2.25 0 0019 14.75v-9.5A2.25 2.25 0 0016.75 3H3.25zm.943 8.752a.75.75 0 01.055-1.06L6.128 9l-1.88-1.693a.75.75 0 111.004-1.114l2.5 2.25a.75.75 0 010 1.114l-2.5 2.25a.75.75 0 01-1.06-.055zM9.75 10.25a.75.75 0 000 1.5h2.5a.75.75 0 000-1.5h-2.5z" clipRule="evenodd" />
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
    group: 'LABS',
    items: [
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
];

// Flatten all items for lookup
const ALL_ITEMS = SECTIONS.flatMap((g) => g.items);

// Cell states from the app's Machine grid (cell-state.ts).
type Cell = 'user' | 'project' | 'copy' | 'differs' | 'none';

const GRID_TOOLS = ['Claude Code', 'Cursor', 'Codex'];

const GRID_ROWS: { kind: string; name: string; cells: Cell[] }[] = [
  { kind: 'MCP server', name: 'github', cells: ['user', 'user', 'user'] },
  { kind: 'MCP server', name: 'postgres', cells: ['user', 'copy', 'differs'] },
  { kind: 'Skill', name: 'review', cells: ['user', 'project', 'copy'] },
  { kind: 'Plugin', name: 'research@harness-kit', cells: ['user', 'none', 'copy'] },
];

const CELL_LABEL: Record<Cell, string> = {
  user: 'user',
  project: 'project',
  copy: '+ copy',
  differs: 'differs',
  none: '—',
};

function getTitleForSection(id: SectionId) {
  return ALL_ITEMS.find((i) => i.id === id)?.title ?? 'Harness Kit';
}

export function DesktopMock({
  interactive = true,
  defaultSection = 'machine',
  compact = false,
}: DesktopMockProps) {
  const [activeSection, setActiveSection] = useState(defaultSection);
  const [hasInteracted, setHasInteracted] = useState(false);
  const tourRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const frameClass = [styles.frame, compact ? styles.compact : ''].filter(Boolean).join(' ');

  const advance = () => {
    setActiveSection((cur) => {
      const idx = ALL_ITEMS.findIndex((i) => i.id === cur);
      return ALL_ITEMS[(idx + 1) % ALL_ITEMS.length].id as SectionId;
    });
  };

  const stopTour = () => {
    if (tourRef.current) { clearInterval(tourRef.current); tourRef.current = null; }
  };

  const handleItemClick = (id: SectionId) => {
    if (!interactive) return;
    stopTour();
    setHasInteracted(true);
    setActiveSection(id);
  };

  const handleHintClick = () => { stopTour(); advance(); };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!interactive) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      stopTour(); setHasInteracted(true); advance();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      stopTour(); setHasInteracted(true);
      setActiveSection((cur) => {
        const idx = ALL_ITEMS.findIndex((i) => i.id === cur);
        return ALL_ITEMS[(idx - 1 + ALL_ITEMS.length) % ALL_ITEMS.length].id as SectionId;
      });
    }
  };

  useEffect(() => {
    if (!interactive) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;
    const delay = setTimeout(() => {
      if (hasInteracted) return;
      tourRef.current = setInterval(() => {
        setHasInteracted((interacted) => {
          if (interacted) { stopTour(); return interacted; }
          advance();
          return false;
        });
      }, 4000);
    }, 2500);
    return () => { clearTimeout(delay); stopTour(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  // On mobile, keep the active tab visible in the horizontal sidebar rail.
  const sidebarRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    const active = sidebar.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    if (!active) return;
    const sb = sidebar.getBoundingClientRect();
    const ab = active.getBoundingClientRect();
    const offLeft = ab.left - sb.left;
    const offRight = ab.right - sb.right;
    if (offLeft < 0) {
      sidebar.scrollBy({ left: offLeft - 12, behavior: 'smooth' });
    } else if (offRight > 0) {
      sidebar.scrollBy({ left: offRight + 12, behavior: 'smooth' });
    }
  }, [activeSection]);

  return (
    <div
      className={frameClass}
      role="region"
      aria-label="Harness Kit desktop application preview"
      tabIndex={interactive ? 0 : -1}
      onKeyDown={handleKeyDown}
    >
      {/* Title bar */}
      <div className={styles.titlebar}>
        <span className={`${styles.tl} ${styles.tlRed}`} />
        <span className={`${styles.tl} ${styles.tlYellow}`} />
        <span className={`${styles.tl} ${styles.tlGreen}`} />
        <span className={styles.titleText}>
          Harness Kit — {getTitleForSection(activeSection)}
        </span>
        {interactive && !hasInteracted && (
          <button className={styles.hintBtn} onClick={handleHintClick}>
            next surface →
          </button>
        )}
      </div>

      {/* Body */}
      <div className={styles.body}>
        {/* Sidebar */}
        <aside className={styles.sidebar} ref={sidebarRef}>
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
          {/* Machine */}
          <div className={`${styles.pane} ${activeSection === 'machine' ? styles.paneActive : ''}`}>
            <div className={styles.paneTitle}>Machine</div>
            <div className={styles.paneSubtitle}>Every resource, across the tools installed here</div>
            <table className={styles.parityTable}>
              <thead>
                <tr>
                  <th>Resource</th>
                  {GRID_TOOLS.map((tool) => (
                    <th key={tool}>{tool}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {GRID_ROWS.map((row) => (
                  <tr key={row.name}>
                    <td>
                      {row.name}
                      <span className={styles.gridKind}> {row.kind}</span>
                    </td>
                    {row.cells.map((cell, i) => (
                      <td key={GRID_TOOLS[i]}>
                        <span
                          className={
                            cell === 'user' || cell === 'project'
                              ? styles.parityCheck
                              : cell === 'differs'
                                ? styles.parityPartial
                                : cell === 'copy'
                                  ? styles.gridCopy
                                  : styles.parityNone
                          }
                        >
                          {CELL_LABEL[cell]}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className={styles.paneSubtitle}>Tools that are not installed are hidden. Click a cell to copy.</div>
          </div>

          {/* Profile */}
          <div className={`${styles.pane} ${styles.paneHarness} ${activeSection === 'profile' ? styles.paneActive : ''}`}>
            <pre className={styles.paneHarnessCode}>
              <span className={styles.yamlComment}># ~/.claude/harness.yaml — your personal profile</span>{'\n'}
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

          {/* Claude Code */}
          <div className={`${styles.pane} ${activeSection === 'claude-code' ? styles.paneActive : ''}`}>
            <div className={styles.paneTitle}>Permissions</div>
            <div className={styles.paneSubtitle}>Claude Code · allow, ask and deny rules</div>
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
              {MOCK_PLUGINS.map((p) => (
                <div key={p.name} className={styles.pluginTile}>
                  <div className={styles.pluginTileName}>{p.name}</div>
                  <div className={styles.pluginTileDesc}>{p.desc}</div>
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

        </div>
      </div>
    </div>
  );
}
