// Architecture flow diagram — "How It Works" docs page.
// Data sourced from apps/desktop/src/layouts/AppLayout.tsx (NAV_SECTIONS)
// and apps/cli/src/index.ts. Keep in sync if sections change.

const FONT = 'system-ui, -apple-system, sans-serif';
const MONO = 'Menlo, Monaco, Consolas, monospace';
const CYAN = '#22b1ec';
const CYAN_DIM = 'rgba(34,177,236,0.18)';
const SURFACE = '#0d1016';
const SURFACE_MID = '#111827';
const BORDER = 'rgba(255,255,255,0.09)';
const BORDER_MID = 'rgba(255,255,255,0.14)';
const MUTED = '#8b919e';
const SUBTLE = '#4a5060';

// Groups sourced from NAV_SECTIONS in AppLayout.tsx
const desktopGroups = [
  { label: 'CORE',      items: ['Harness', 'Marketplace'] },
  { label: 'INSIGHTS',  items: ['Observatory'] },
  { label: 'SYSTEM',    items: ['Security'] },
  { label: 'WORKFLOWS', items: ['Board', 'Roadmap'] },
  { label: 'OTHER',     items: ['Agents', 'Comparator', 'Parity', 'AI Chat', 'Memory'] },
];

// Commands sourced from apps/cli/src/index.ts
const cliCommands = ['validate', 'compile', 'sync', 'check', 'detect', 'scan'];

const pluginParts = [
  { name: 'SKILL.md', desc: 'workflow definition', highlight: true },
  { name: 'agents/',   desc: 'specialist subagents' },
  { name: 'hooks/',    desc: 'lifecycle handlers' },
  { name: 'scripts/',  desc: 'shell automation' },
];

// Harnesses sourced from cross-harness/ide-support.md support matrix
const harnesses = ['Claude Code', 'Copilot', 'Cursor', 'Codex'];

// 3 rows × 2 columns; values shortened to fit 286px value column
const yamlFields = [
  { key: 'plugins:',      val: 'research  board  explain' },
  { key: 'mcp-servers:',  val: 'memory  filesystem' },
  { key: 'instructions:', val: '{ operational, behavioral }' },
  { key: 'permissions:',  val: '{ tools, paths, network }' },
  { key: 'env:',          val: 'ANTHROPIC_API_KEY: ${...}' },
  { key: 'extends:',      val: 'profiles/backend-engineer.yaml' },
];

export function ArchitectureDiagram() {
  // ── Layout constants ────────────────────────────────────────────────────────
  const W = 780;

  // harness.yaml — full width, top
  const HY = { x: 20,  y: 20,  w: 740, h: 142 };

  // Left column
  const DA = { x: 20,  y: 200, w: 340, h: 280 };  // Desktop App

  // Right column
  const CL = { x: 420, y: 200, w: 340, h: 112 };  // CLI
  const CC = { x: 420, y: 342, w: 340, h: 86  };  // Native Configs

  // Bottom row  (PS.y = DA.y + DA.h + 20 = 500; AT aligns with PS)
  const PS = { x: 20,  y: 500, w: 340, h: 124 };  // Plugin System
  const AT = { x: 420, y: 500, w: 340, h: 124 };  // AI Tools

  const totalH = 644;

  // ── Derived midpoints used by arrows ────────────────────────────────────────
  // Feedback path runs at x=390 — in the 60 px gap between DA/PS (right=360) and CL/AT (left=420)
  const feedX    = 390;
  const atMidY   = AT.y + AT.h / 2;   // 562
  const daMidY   = DA.y + DA.h / 2;   // 340

  return (
    <div className="not-prose my-8">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${W} ${totalH}`}
        style={{ width: '100%', display: 'block' }}
        aria-label="harness-kit architecture: harness.yaml → Desktop App and CLI → Native Configs → Harnesses; Plugin System runs in Harnesses"
      >
        <defs>
          {/* Reusable arrowheads — one per style to avoid duplicate IDs */}
          <marker id="ad-arr-cyan" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0,8 3,0 6" fill={CYAN} />
          </marker>
          <marker id="ad-arr-subtle" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0,8 3,0 6" fill={SUBTLE} opacity="0.8" />
          </marker>
        </defs>

        {/* ════════════════════════════════════════════════════════════════════
            harness.yaml
        ════════════════════════════════════════════════════════════════════ */}
        <rect x={HY.x} y={HY.y} width={HY.w} height={HY.h} rx={10}
          fill={SURFACE} stroke={CYAN} strokeWidth={1.5} />

        <text x={HY.x + HY.w / 2} y={HY.y + 23}
          fontFamily={MONO} fontSize={14} fontWeight={700}
          fill={CYAN} textAnchor="middle">
          harness.yaml
        </text>

        <line
          x1={HY.x + 16} y1={HY.y + 33}
          x2={HY.x + HY.w - 16} y2={HY.y + 33}
          stroke={CYAN_DIM} strokeWidth={1}
        />

        {/* YAML fields — 3 rows × 2 columns
            Left col: x=44, Right col: x=418
            Value offset: +86 px (clears longest key "instructions:") */}
        {yamlFields.map((f, i) => {
          const col = i % 2;
          const row = Math.floor(i / 2);
          const kx  = HY.x + 24 + col * 374;
          const ky  = HY.y + 56 + row * 28;
          return (
            <g key={f.key}>
              <text x={kx}      y={ky} fontFamily={MONO} fontSize={9} fontWeight={600} fill={MUTED}>{f.key}</text>
              <text x={kx + 86} y={ky} fontFamily={MONO} fontSize={9}                  fill={SUBTLE}>{f.val}</text>
            </g>
          );
        })}

        {/* ════════════════════════════════════════════════════════════════════
            Arrows: harness.yaml → Desktop App and CLI
        ════════════════════════════════════════════════════════════════════ */}
        {/* → Desktop App */}
        <line
          x1={160} y1={HY.y + HY.h}
          x2={DA.x + DA.w / 2} y2={DA.y}
          stroke={CYAN} strokeWidth={1.5} markerEnd="url(#ad-arr-cyan)" opacity={0.7}
        />
        <text x={148} y={HY.y + HY.h + 16}
          fontFamily={FONT} fontSize={9} fontWeight={600} fill={CYAN} textAnchor="middle" opacity={0.9}>
          manages
        </text>

        {/* → CLI */}
        <line
          x1={620} y1={HY.y + HY.h}
          x2={CL.x + CL.w / 2} y2={CL.y}
          stroke={CYAN} strokeWidth={1.5} markerEnd="url(#ad-arr-cyan)" opacity={0.7}
        />
        <text x={635} y={HY.y + HY.h + 16}
          fontFamily={FONT} fontSize={9} fontWeight={600} fill={CYAN} textAnchor="middle" opacity={0.9}>
          compile / validate
        </text>

        {/* ════════════════════════════════════════════════════════════════════
            Desktop App
        ════════════════════════════════════════════════════════════════════ */}
        <rect x={DA.x} y={DA.y} width={DA.w} height={DA.h} rx={10}
          fill={SURFACE_MID} stroke={CYAN_DIM} strokeWidth={1} />

        <text x={DA.x + DA.w / 2} y={DA.y + 16}
          fontFamily={FONT} fontSize={8} fontWeight={700} letterSpacing="0.1em"
          fill={SUBTLE} textAnchor="middle">
          DESKTOP APP
        </text>

        {/* Groups — calculated at render time so gy advances correctly */}
        {(() => {
          let gy = DA.y + 26;
          return desktopGroups.map((g) => {
            const maxPerRow = g.label === 'OTHER' ? 3 : 2;
            const chipW     = maxPerRow === 3 ? 100 : 152;
            const chipH     = 18;
            const gap       = 6;
            const rows      = Math.ceil(g.items.length / maxPerRow);

            const groupStartY = gy;
            // Advance: group label + chip rows + bottom gap
            gy += 11 + rows * (chipH + 4) + 9;

            return (
              <g key={g.label}>
                {/* Section label */}
                <text
                  x={DA.x + 14} y={groupStartY + 9}
                  fontFamily={FONT} fontSize={7.5} fontWeight={700}
                  letterSpacing="0.09em" fill={SUBTLE}
                >
                  {g.label}
                </text>

                {/* Chips */}
                {g.items.map((item, ii) => {
                  const col   = ii % maxPerRow;
                  const row   = Math.floor(ii / maxPerRow);
                  const chipX = DA.x + 14 + col * (chipW + gap);
                  const chipY = groupStartY + 12 + row * (chipH + 4);
                  return (
                    <g key={item}>
                      <rect x={chipX} y={chipY} width={chipW} height={chipH} rx={4}
                        fill={SURFACE} stroke={BORDER_MID} />
                      <text
                        x={chipX + chipW / 2} y={chipY + 12}
                        fontFamily={FONT} fontSize={9} fill={MUTED} textAnchor="middle"
                      >
                        {item}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          });
        })()}

        {/* ════════════════════════════════════════════════════════════════════
            CLI
        ════════════════════════════════════════════════════════════════════ */}
        <rect x={CL.x} y={CL.y} width={CL.w} height={CL.h} rx={10}
          fill={SURFACE_MID} stroke={BORDER} strokeWidth={1} />

        <text x={CL.x + CL.w / 2} y={CL.y + 16}
          fontFamily={FONT} fontSize={8} fontWeight={700} letterSpacing="0.1em"
          fill={SUBTLE} textAnchor="middle">
          CLI — harness-kit
        </text>
        <text x={CL.x + CL.w / 2} y={CL.y + 30}
          fontFamily={FONT} fontSize={8.5} fill={SUBTLE} textAnchor="middle">
          standalone terminal tool
        </text>

        {/* Command chips — 2 rows of 3
            chipW=100, gap=8 → 3×100 + 2×8 = 316 px; start at CL.x+14=434 */}
        {cliCommands.map((cmd, i) => {
          const col = i % 3;
          const row = Math.floor(i / 3);
          const cx  = CL.x + 14 + col * 108;
          const cy  = CL.y + 42 + row * 28;
          return (
            <g key={cmd}>
              <rect x={cx} y={cy} width={100} height={20} rx={4}
                fill={SURFACE} stroke={BORDER} />
              <text x={cx + 50} y={cy + 13.5}
                fontFamily={MONO} fontSize={9} fill={MUTED} textAnchor="middle">
                {cmd}
              </text>
            </g>
          );
        })}

        {/* ── Arrow: CLI → Native Configs ── */}
        <line
          x1={CL.x + CL.w / 2} y1={CL.y + CL.h}
          x2={CC.x + CC.w / 2} y2={CC.y}
          stroke={CYAN} strokeWidth={1.5} markerEnd="url(#ad-arr-cyan)" opacity={0.7}
        />
        <text x={CL.x + CL.w / 2 + 62} y={(CL.y + CL.h + CC.y) / 2 + 4}
          fontFamily={FONT} fontSize={9} fontWeight={600} fill={CYAN} textAnchor="middle" opacity={0.9}>
          compiles to
        </text>

        {/* ════════════════════════════════════════════════════════════════════
            Native Configs
        ════════════════════════════════════════════════════════════════════ */}
        <rect x={CC.x} y={CC.y} width={CC.w} height={CC.h} rx={10}
          fill={SURFACE} stroke={BORDER} strokeWidth={1} />

        <text x={CC.x + CC.w / 2} y={CC.y + 16}
          fontFamily={FONT} fontSize={8} fontWeight={700} letterSpacing="0.1em"
          fill={SUBTLE} textAnchor="middle">
          NATIVE CONFIGS
        </text>

        {['.claude/settings.json', '.cursor/rules', 'copilot config'].map((c, i) => (
          <text key={c}
            x={CC.x + CC.w / 2} y={CC.y + 34 + i * 16}
            fontFamily={MONO} fontSize={9} fill={SUBTLE} textAnchor="middle">
            {c}
          </text>
        ))}

        {/* ── Arrow: Native Configs → AI Tools (dashed — loaded at session start) ── */}
        <line
          x1={CC.x + CC.w / 2} y1={CC.y + CC.h}
          x2={AT.x + AT.w / 2} y2={AT.y}
          stroke={SUBTLE} strokeWidth={1} strokeDasharray="4 3"
          markerEnd="url(#ad-arr-subtle)" opacity={0.35}
        />
        <text x={CC.x + CC.w / 2 + 58} y={(CC.y + CC.h + AT.y) / 2 + 4}
          fontFamily={FONT} fontSize={9} fontWeight={600} fill={SUBTLE} textAnchor="middle" opacity={0.55}>
          loads into
        </text>

        {/* ════════════════════════════════════════════════════════════════════
            Plugin System
        ════════════════════════════════════════════════════════════════════ */}
        <rect x={PS.x} y={PS.y} width={PS.w} height={PS.h} rx={10}
          fill={SURFACE_MID} stroke={BORDER} strokeWidth={1} />

        <text x={PS.x + PS.w / 2} y={PS.y + 16}
          fontFamily={FONT} fontSize={8} fontWeight={700} letterSpacing="0.1em"
          fill={SUBTLE} textAnchor="middle">
          PLUGIN SYSTEM
        </text>

        {/* 2×2 grid of plugin parts; chip width=154, gap=8 → 2×154+8=316 in 340 */}
        {pluginParts.map((p, i) => {
          const col  = i % 2;
          const row  = Math.floor(i / 2);
          const px   = PS.x + 14 + col * 162;
          const py   = PS.y + 28 + row * 32;
          return (
            <g key={p.name}>
              <rect x={px} y={py} width={154} height={22} rx={4}
                fill={SURFACE}
                stroke={p.highlight ? CYAN_DIM : BORDER}
                strokeWidth={1}
              />
              {/* name */}
              <text x={px + 8} y={py + 14.5}
                fontFamily={MONO} fontSize={9}
                fill={p.highlight ? CYAN : MUTED}>
                {p.name}
              </text>
              {/* description */}
              <text x={px + 8 + (p.name.length * 5.6)} y={py + 14.5}
                fontFamily={FONT} fontSize={8.5}
                fill={SUBTLE}>
                {'  '}{p.desc}
              </text>
            </g>
          );
        })}

        {/* ── Arrow: Plugin System → AI Tools ── */}
        <line
          x1={PS.x + PS.w} y1={PS.y + PS.h / 2}
          x2={AT.x}         y2={AT.y + AT.h / 2}
          stroke={CYAN} strokeWidth={1.5} markerEnd="url(#ad-arr-cyan)" opacity={0.7}
        />
        <text
          x={(PS.x + PS.w + AT.x) / 2} y={PS.y + PS.h / 2 - 7}
          fontFamily={FONT} fontSize={9} fontWeight={600}
          fill={CYAN} textAnchor="middle" opacity={0.9}>
          runs in
        </text>

        {/* ════════════════════════════════════════════════════════════════════
            AI Tools
        ════════════════════════════════════════════════════════════════════ */}
        <rect x={AT.x} y={AT.y} width={AT.w} height={AT.h} rx={10}
          fill={SURFACE_MID} stroke={BORDER} strokeWidth={1} />

        <text x={AT.x + AT.w / 2} y={AT.y + 16}
          fontFamily={FONT} fontSize={8} fontWeight={700} letterSpacing="0.1em"
          fill={SUBTLE} textAnchor="middle">
          HARNESSES
        </text>

        {/* 2×2 grid; chipW=155, gap=8; 2×155+8=318 in 340 */}
        {harnesses.map((tool, i) => {
          const col = i % 2;
          const row = Math.floor(i / 2);
          const tx  = AT.x + 14 + col * 163;
          const ty  = AT.y + 26 + row * 30;
          return (
            <g key={tool}>
              <rect x={tx} y={ty} width={155} height={20} rx={4}
                fill={SURFACE} stroke={BORDER_MID} />
              <text x={tx + 77.5} y={ty + 13.5}
                fontFamily={FONT} fontSize={9} fill={MUTED} textAnchor="middle">
                {tool}
              </text>
            </g>
          );
        })}

        {/* ════════════════════════════════════════════════════════════════════
            Session data feedback: AI Tools Observatory → Desktop App
            Path runs at x=390 — the 60 px gap between the two columns.
            DA right edge = 360, AT left edge = 420. No box overlap.
        ════════════════════════════════════════════════════════════════════ */}
        <defs>
          <marker id="ad-arr-feedback" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0,8 3,0 6" fill={SUBTLE} opacity="0.5" />
          </marker>
        </defs>
        <path
          d={`M${AT.x},${atMidY} L${feedX},${atMidY} L${feedX},${daMidY} L${DA.x + DA.w},${daMidY}`}
          fill="none"
          stroke={SUBTLE}
          strokeWidth={1}
          strokeDasharray="4 3"
          markerEnd="url(#ad-arr-feedback)"
          opacity={0.35}
        />
        <text
          x={feedX - 10}
          y={(atMidY + daMidY) / 2}
          fontFamily={FONT} fontSize={8} fill={SUBTLE}
          textAnchor="middle" opacity={0.5}
          transform={`rotate(-90, ${feedX - 10}, ${(atMidY + daMidY) / 2})`}
        >
          session data
        </text>

      </svg>
    </div>
  );
}
