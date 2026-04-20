// Agent execution runtime diagram — "Agentic Task Execution" concepts page.
// Data sourced from packages/agent-server/src/{http,ws,runner,types}.ts and
// packages/board-server/src/http/routes.ts. Keep in sync if ports or paths change.

const FONT = 'system-ui, -apple-system, sans-serif';
const MONO = 'Menlo, Monaco, Consolas, monospace';
const CYAN = '#22b1ec';
const CYAN_DIM = 'rgba(34,177,236,0.18)';
const AMBER = '#f59e0b';
const AMBER_DIM = 'rgba(245,158,11,0.18)';
const EMERALD = '#34d399';
const EMERALD_DIM = 'rgba(52,211,153,0.18)';
const SURFACE = '#0d1016';
const SURFACE_MID = '#111827';
const BORDER = 'rgba(255,255,255,0.09)';
const BORDER_MID = 'rgba(255,255,255,0.14)';
const MUTED = '#8b919e';
const SUBTLE = '#4a5060';

// Five phases in order — sourced from graph.ts
const PHASES = [
  { label: 'spec',     color: '#6B7FA0' },
  { label: 'planning', color: AMBER },
  { label: 'coding',   color: CYAN },
  { label: 'qa review',color: EMERALD },
  { label: 'qa fix',   color: '#fb923c' },
];

export function AgentExecutionDiagram() {
  const W = 780;

  // ── Boxes ────────────────────────────────────────────────────────────────────
  const DC  = { x: 20,  y: 30,  w: 310, h: 95 };   // Desktop Card
  const AS  = { x: 450, y: 30,  w: 310, h: 95 };   // agent-server :4802
  const TOK = { x: 450, y: 142, w: 310, h: 26 };   // auth token badge
  const LG  = { x: 20,  y: 188, w: 740, h: 148 };  // LangGraph runtime
  const CP  = { x: 20,  y: 352, w: 220, h: 26 };   // SQLite checkpoint
  const WT  = { x: 20,  y: 396, w: 310, h: 82 };   // worktree
  const BS  = { x: 450, y: 396, w: 310, h: 82 };   // board-server :4800

  const totalH = WT.y + WT.h + 20;   // 498

  // ── Arrow helper midpoints ───────────────────────────────────────────────────
  const dcRightX  = DC.x + DC.w;           // 330
  const asLeftX   = AS.x;                   // 450
  const midGapX   = (dcRightX + asLeftX) / 2;  // 390 — gap between DC and AS

  const lgMidX   = LG.x + LG.w / 2;       // 390
  const asMidX   = AS.x + AS.w / 2;        // 605
  const asBotY   = AS.y + AS.h;            // 125

  const dcMidY   = DC.y + DC.h / 2;        // 77.5
  const asMidY   = AS.y + AS.h / 2;        // 77.5

  const lgBotY   = LG.y + LG.h;            // 336
  const wtMidX   = WT.x + WT.w / 2;        // 175
  const bsMidX   = BS.x + BS.w / 2;        // 605
  const wtTopY   = WT.y;                    // 396
  const bsTopY   = BS.y;                    // 396

  return (
    <div className="not-prose my-8">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${W} ${totalH}`}
        style={{ width: '100%', display: 'block' }}
        aria-label="Agent execution runtime: Desktop Card sends HTTP POST to agent-server, which runs a LangGraph pipeline (spec, planning, coding, QA). The pipeline reads/writes the worktree via fs-tools and updates the board via board MCP tools. Events stream back to the card via WebSocket."
      >
        <defs>
          <marker id="aed-arr-cyan" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0,8 3,0 6" fill={CYAN} />
          </marker>
          <marker id="aed-arr-amber" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0,8 3,0 6" fill={AMBER} />
          </marker>
          <marker id="aed-arr-emerald" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0,8 3,0 6" fill={EMERALD} />
          </marker>
          <marker id="aed-arr-subtle" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0,8 3,0 6" fill={SUBTLE} opacity="0.7" />
          </marker>
        </defs>

        {/* ══════════════════════════════════════════════════════════════════════
            Desktop Card (Board UI)
        ══════════════════════════════════════════════════════════════════════ */}
        <rect x={DC.x} y={DC.y} width={DC.w} height={DC.h} rx={10}
          fill={SURFACE_MID} stroke={CYAN} strokeWidth={1.5} />

        <text x={DC.x + DC.w / 2} y={DC.y + 18}
          fontFamily={FONT} fontSize={8} fontWeight={700} letterSpacing="0.1em"
          fill={SUBTLE} textAnchor="middle">
          DESKTOP — BOARD CARD
        </text>

        {/* Phase progress badge mockup */}
        {[
          { label: '● Coding',  prog: 65, color: CYAN },
          { label: 'subtask 3/8 in progress', prog: null, color: MUTED },
        ].map((row, i) => (
          <text key={row.label}
            x={DC.x + 14} y={DC.y + 40 + i * 18}
            fontFamily={MONO} fontSize={9}
            fill={row.color}>
            {row.label}
          </text>
        ))}

        {/* Mini progress bar */}
        <rect x={DC.x + 14} y={DC.y + 68} width={DC.w - 28} height={4} rx={2}
          fill={SURFACE} />
        <rect x={DC.x + 14} y={DC.y + 68} width={(DC.w - 28) * 0.65} height={4} rx={2}
          fill={CYAN} opacity={0.8} />

        {/* Controls row */}
        {['Start', 'Pause', 'Steer'].map((label, i) => (
          <g key={label}>
            <rect x={DC.x + 14 + i * 70} y={DC.y + 78} width={62} height={16} rx={3}
              fill={SURFACE} stroke={BORDER_MID} />
            <text x={DC.x + 14 + i * 70 + 31} y={DC.y + 89}
              fontFamily={FONT} fontSize={8} fill={MUTED} textAnchor="middle">
              {label}
            </text>
          </g>
        ))}

        {/* ══════════════════════════════════════════════════════════════════════
            agent-server :4802
        ══════════════════════════════════════════════════════════════════════ */}
        <rect x={AS.x} y={AS.y} width={AS.w} height={AS.h} rx={10}
          fill={SURFACE_MID} stroke={AMBER_DIM} strokeWidth={1.5} />

        <text x={AS.x + AS.w / 2} y={AS.y + 18}
          fontFamily={FONT} fontSize={8} fontWeight={700} letterSpacing="0.1em"
          fill={SUBTLE} textAnchor="middle">
          AGENT-SERVER
        </text>

        <text x={AS.x + AS.w / 2} y={AS.y + 36}
          fontFamily={MONO} fontSize={11} fontWeight={700}
          fill={AMBER} textAnchor="middle">
          :4802
        </text>

        {/* Route chips */}
        {[
          'POST /projects/:slug/tasks/:id/start',
          'POST /…/pause   POST /…/resume',
          'POST /…/steer   GET  /…/status',
        ].map((route, i) => (
          <text key={route}
            x={AS.x + AS.w / 2} y={AS.y + 54 + i * 14}
            fontFamily={MONO} fontSize={7.5} fill={SUBTLE} textAnchor="middle">
            {route}
          </text>
        ))}

        {/* ── Auth token badge ── */}
        <rect x={TOK.x} y={TOK.y} width={TOK.w} height={TOK.h} rx={5}
          fill={SURFACE} stroke={BORDER} />
        <text x={TOK.x + 10} y={TOK.y + 17}
          fontFamily={MONO} fontSize={8.5} fill={SUBTLE}>
          ~/.harness-kit/agent-server.token (mode 0600)
        </text>

        {/* ══════════════════════════════════════════════════════════════════════
            HTTP arrow: Card → agent-server
        ══════════════════════════════════════════════════════════════════════ */}
        <line
          x1={dcRightX} y1={DC.y + 38}
          x2={asLeftX}  y2={AS.y + 38}
          stroke={CYAN} strokeWidth={1.5} markerEnd="url(#aed-arr-cyan)" />
        <text x={midGapX} y={DC.y + 33}
          fontFamily={FONT} fontSize={8.5} fontWeight={600}
          fill={CYAN} textAnchor="middle">
          POST /start
        </text>

        {/* WebSocket arrow: agent-server → Card */}
        <line
          x1={asLeftX}  y1={AS.y + 62}
          x2={dcRightX} y2={DC.y + 62}
          stroke={EMERALD} strokeWidth={1.5} markerEnd="url(#aed-arr-emerald)" />
        <text x={midGapX} y={AS.y + 58}
          fontFamily={FONT} fontSize={8} fontWeight={600}
          fill={EMERALD} textAnchor="middle">
          WS events
        </text>
        <text x={midGapX} y={AS.y + 70}
          fontFamily={MONO} fontSize={7} fill={SUBTLE} textAnchor="middle">
          agent_phase · agent_thought · agent_tool
        </text>

        {/* "runs" arrow: agent-server → LangGraph */}
        <line
          x1={asMidX} y1={asBotY}
          x2={lgMidX} y2={LG.y}
          stroke={AMBER} strokeWidth={1.5} markerEnd="url(#aed-arr-amber)" opacity={0.8} />
        <text x={lgMidX + 58} y={(asBotY + LG.y) / 2 + 4}
          fontFamily={FONT} fontSize={9} fontWeight={600}
          fill={AMBER} textAnchor="middle" opacity={0.9}>
          runs pipeline
        </text>

        {/* ══════════════════════════════════════════════════════════════════════
            LangGraph Runtime
        ══════════════════════════════════════════════════════════════════════ */}
        <rect x={LG.x} y={LG.y} width={LG.w} height={LG.h} rx={10}
          fill={SURFACE} stroke={AMBER_DIM} strokeWidth={1.5} />

        <text x={LG.x + LG.w / 2} y={LG.y + 18}
          fontFamily={FONT} fontSize={8} fontWeight={700} letterSpacing="0.1em"
          fill={SUBTLE} textAnchor="middle">
          LANGGRAPH RUNTIME — five-phase state graph
        </text>

        {/* Phase chips */}
        {(() => {
          const chipW = 130;
          const chipH = 30;
          const gap   = 8;
          const totalChipW = PHASES.length * chipW + (PHASES.length - 1) * gap;
          const startX = LG.x + (LG.w - totalChipW) / 2;
          const chipY  = LG.y + 34;

          return (
            <g>
              {PHASES.map((ph, i) => {
                const cx = startX + i * (chipW + gap);
                return (
                  <g key={ph.label}>
                    <rect x={cx} y={chipY} width={chipW} height={chipH} rx={5}
                      fill={SURFACE_MID} stroke={ph.color} strokeWidth={1} opacity={0.9} />
                    <text x={cx + chipW / 2} y={chipY + 19}
                      fontFamily={MONO} fontSize={10} fontWeight={600}
                      fill={ph.color} textAnchor="middle">
                      {ph.label}
                    </text>
                  </g>
                );
              })}

              {/* Arrows between chips */}
              {PHASES.slice(0, -1).map((ph, i) => {
                const x1 = startX + (i + 1) * (chipW + gap) - gap;
                const y1 = chipY + chipH / 2;
                const x2 = startX + (i + 1) * (chipW + gap);
                return (
                  <line key={`arr-${i}`}
                    x1={x1} y1={y1} x2={x2} y2={y1}
                    stroke={SUBTLE} strokeWidth={1}
                    markerEnd="url(#aed-arr-subtle)" />
                );
              })}

              {/* QA retry arc: qa_fix → coding (curved arrow back) */}
              {(() => {
                const qaFixIdx = 4;  // qa_fix
                const codingIdx = 2; // coding
                const qaFixX = startX + qaFixIdx * (chipW + gap);
                const codingX = startX + codingIdx * (chipW + gap);
                const arcY = chipY + chipH + 14;
                return (
                  <path
                    d={`M${qaFixX + chipW / 2},${chipY + chipH} Q${(qaFixX + codingX + chipW) / 2},${arcY + 18} ${codingX + chipW / 2},${chipY + chipH}`}
                    fill="none" stroke="#fb923c" strokeWidth={1} strokeDasharray="4 3"
                    markerEnd="url(#aed-arr-subtle)" opacity={0.7} />
                );
              })()}

            </g>
          );
        })()}

        {/* Retry label */}
        <text x={LG.x + LG.w / 2} y={LG.y + LG.h - 22}
          fontFamily={FONT} fontSize={8} fill={SUBTLE} textAnchor="middle">
          QA fail → retry coding (max 3 attempts), then surface to human
        </text>

        {/* Tools row */}
        {[
          { label: 'fs-tools: read_file · write_file · edit_file · bash', color: CYAN },
          { label: 'board MCP tools via board-server :4800/mcp', color: AMBER },
        ].map((row, i) => (
          <text key={row.label}
            x={LG.x + 14} y={LG.y + 112 + i * 14}
            fontFamily={MONO} fontSize={8}
            fill={row.color} opacity={0.8}>
            {row.label}
          </text>
        ))}

        {/* SQLite checkpoint badge */}
        <rect x={CP.x} y={CP.y} width={CP.w} height={CP.h} rx={5}
          fill={SURFACE} stroke={BORDER} />
        <text x={CP.x + 10} y={CP.y + 17}
          fontFamily={MONO} fontSize={8} fill={SUBTLE}>
          SQLite checkpoint — pause/resume state
        </text>

        {/* ── Arrow: LangGraph → worktree ── */}
        <line
          x1={LG.x + 155} y1={lgBotY}
          x2={wtMidX}      y2={wtTopY}
          stroke={CYAN} strokeWidth={1.5} markerEnd="url(#aed-arr-cyan)" opacity={0.8} />
        <text x={wtMidX - 12} y={(lgBotY + wtTopY) / 2 + 4}
          fontFamily={FONT} fontSize={8.5} fontWeight={600}
          fill={CYAN} textAnchor="end" opacity={0.9}>
          fs-tools
        </text>

        {/* ── Arrow: LangGraph → board-server ── */}
        <line
          x1={LG.x + LG.w - 155} y1={lgBotY}
          x2={bsMidX}              y2={bsTopY}
          stroke={AMBER} strokeWidth={1.5} markerEnd="url(#aed-arr-amber)" opacity={0.8} />
        <text x={bsMidX + 14} y={(lgBotY + bsTopY) / 2 + 4}
          fontFamily={FONT} fontSize={8.5} fontWeight={600}
          fill={AMBER} textAnchor="start" opacity={0.9}>
          board MCP
        </text>

        {/* ══════════════════════════════════════════════════════════════════════
            Worktree
        ══════════════════════════════════════════════════════════════════════ */}
        <rect x={WT.x} y={WT.y} width={WT.w} height={WT.h} rx={10}
          fill={SURFACE_MID} stroke={CYAN_DIM} strokeWidth={1} />

        <text x={WT.x + WT.w / 2} y={WT.y + 18}
          fontFamily={FONT} fontSize={8} fontWeight={700} letterSpacing="0.1em"
          fill={SUBTLE} textAnchor="middle">
          WORKTREE
        </text>

        {[
          'git worktree add .worktrees/<task-id>',
          'isolated branch per task · files scoped here',
        ].map((line, i) => (
          <text key={line}
            x={WT.x + WT.w / 2} y={WT.y + 36 + i * 16}
            fontFamily={MONO} fontSize={8} fill={SUBTLE} textAnchor="middle">
            {line}
          </text>
        ))}

        <text x={WT.x + WT.w / 2} y={WT.y + 68}
          fontFamily={FONT} fontSize={8} fill={MUTED} textAnchor="middle">
          read/write/bash confined to worktree_path
        </text>

        {/* ══════════════════════════════════════════════════════════════════════
            board-server :4800
        ══════════════════════════════════════════════════════════════════════ */}
        <rect x={BS.x} y={BS.y} width={BS.w} height={BS.h} rx={10}
          fill={SURFACE_MID} stroke={AMBER_DIM} strokeWidth={1} />

        <text x={BS.x + BS.w / 2} y={BS.y + 18}
          fontFamily={FONT} fontSize={8} fontWeight={700} letterSpacing="0.1em"
          fill={SUBTLE} textAnchor="middle">
          BOARD-SERVER
        </text>

        <text x={BS.x + BS.w / 2} y={BS.y + 36}
          fontFamily={MONO} fontSize={11} fontWeight={700}
          fill={AMBER} textAnchor="middle">
          :4800
        </text>

        {[
          'subtask writes during planning · status updates',
          'PATCH /execution ← agent-server (done/fail)',
        ].map((line, i) => (
          <text key={line}
            x={BS.x + BS.w / 2} y={BS.y + 52 + i * 14}
            fontFamily={MONO} fontSize={7.5} fill={SUBTLE} textAnchor="middle">
            {line}
          </text>
        ))}

      </svg>
    </div>
  );
}
