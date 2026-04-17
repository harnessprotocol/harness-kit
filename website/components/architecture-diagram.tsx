// Architecture flow diagram — "How It Works" docs page.
// Data sourced from apps/desktop/src/layouts/AppLayout.tsx (NAV_SECTIONS)
// and apps/cli/src/index.ts. Keep in sync if sections change.

const FONT = 'system-ui, -apple-system, sans-serif';
const MONO = 'Menlo, Monaco, Consolas, monospace';
const CYAN = '#22b1ec';
const CYAN_DIM = 'rgba(34,177,236,0.25)';
const CYAN_FAINT = 'rgba(34,177,236,0.08)';
const SURFACE = '#0d1016';
const SURFACE_MID = '#111827';
const BORDER = 'rgba(255,255,255,0.08)';
const TEXT = '#e4e7ec';
const MUTED = '#8b919e';
const SUBTLE = '#545b67';

// Groups come from NAV_SECTIONS in AppLayout.tsx
const desktopGroups = [
  { label: 'CORE', items: ['Harness', 'Marketplace'] },
  { label: 'INSIGHTS', items: ['Observatory'] },
  { label: 'SYSTEM', items: ['Security'] },
  { label: 'WORKFLOWS', items: ['Board', 'Roadmap'] },
  { label: 'OTHER', items: ['Agents', 'Comparator', 'Parity', 'AI Chat', 'Memory'] },
];

const cliCommands = ['validate', 'compile', 'sync', 'check', 'detect', 'scan'];

const pluginParts = [
  { name: 'SKILL.md', desc: 'workflow definition', highlight: true },
  { name: 'agents/', desc: 'specialist subagents' },
  { name: 'hooks/', desc: 'lifecycle events' },
  { name: 'scripts/', desc: 'shell automation' },
];

const aiTools = ['Claude Code', 'Cursor', 'Copilot', 'Windsurf', 'Zed'];

const yamlLines = [
  { key: 'plugins:', val: '- research@0.2.0  - board@0.1.0  - explain@0.2.0' },
  { key: 'mcp-servers:', val: '- memory  - filesystem' },
  { key: 'instructions:', val: '{ operational, behavioral, identity }' },
  { key: 'permissions:', val: '{ tools, paths, network }' },
  { key: 'env:', val: 'ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}' },
  { key: 'extends:', val: '[ profiles/backend-engineer.yaml ]' },
];

/* ─── sub-components ─── */

function Label({ x, y, children }: { x: number; y: number; children: string }) {
  return (
    <text
      x={x} y={y}
      fontFamily={FONT} fontSize={8} fontWeight={700}
      letterSpacing="0.1em" fill={SUBTLE}
      textAnchor="middle"
    >
      {children}
    </text>
  );
}

function Arrow({
  x1, y1, x2, y2,
  label, labelX, labelY,
  dashed,
}: {
  x1: number; y1: number; x2: number; y2: number;
  label?: string; labelX?: number; labelY?: number;
  dashed?: boolean;
}) {
  return (
    <>
      <defs>
        <marker id={`arr-${x1}-${y1}`} markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0,8 3,0 6" fill={dashed ? SUBTLE : CYAN} />
        </marker>
      </defs>
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={dashed ? SUBTLE : CYAN}
        strokeWidth={dashed ? 1 : 1.5}
        strokeDasharray={dashed ? '4 3' : undefined}
        markerEnd={`url(#arr-${x1}-${y1})`}
        opacity={dashed ? 0.4 : 0.7}
      />
      {label && (
        <text
          x={labelX ?? (x1 + x2) / 2}
          y={labelY ?? (y1 + y2) / 2 - 5}
          fontFamily={FONT} fontSize={9} fontWeight={600}
          fill={dashed ? SUBTLE : CYAN}
          textAnchor="middle"
          opacity={dashed ? 0.6 : 0.9}
        >
          {label}
        </text>
      )}
    </>
  );
}

/* ─── main diagram ─── */

export function ArchitectureDiagram() {
  // Layout constants
  const W = 680;

  // harness.yaml: top center
  const HY = { x: 80, y: 24, w: 520, h: 116 };

  // Desktop App: left column
  const DA = { x: 24, y: 184, w: 236, h: 262 };

  // CLI: right column (top)
  const CL = { x: 424, y: 184, w: 232, h: 100 };

  // Compiled configs: right column (below CLI)
  const CC = { x: 424, y: 304, w: 232, h: 72 };

  // Plugin System: bottom left
  const PS = { x: 24, y: 490, w: 236, h: 90 };

  // AI Tools: bottom center-right
  const AT = { x: 280, y: 480, w: 240, h: 80 };

  const totalH = 590;

  return (
    <div className="not-prose my-8">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${W} ${totalH}`}
        style={{ width: '100%', display: 'block' }}
        aria-label="harness-kit architecture diagram"
      >

        {/* ── harness.yaml ── */}
        <rect x={HY.x} y={HY.y} width={HY.w} height={HY.h} rx={10}
          fill={SURFACE} stroke={CYAN} strokeWidth={1.5} />

        {/* header row */}
        <text x={HY.x + HY.w / 2} y={HY.y + 22}
          fontFamily={MONO} fontSize={14} fontWeight={700}
          fill={CYAN} textAnchor="middle">
          harness.yaml
        </text>
        <line x1={HY.x + 16} y1={HY.y + 30} x2={HY.x + HY.w - 16} y2={HY.y + 30}
          stroke={CYAN_DIM} strokeWidth={1} />

        {/* yaml fields — two columns */}
        {yamlLines.map((line, i) => {
          const col = i % 2;
          const row = Math.floor(i / 2);
          const cx = HY.x + 20 + col * 258;
          const cy = HY.y + 47 + row * 24;
          return (
            <g key={i}>
              <text x={cx} y={cy} fontFamily={MONO} fontSize={9} fontWeight={600} fill={MUTED}>{line.key}</text>
              <text x={cx + 80} y={cy} fontFamily={MONO} fontSize={9} fill={SUBTLE}>{line.val}</text>
            </g>
          );
        })}

        {/* ── Arrows: harness.yaml → Desktop App & CLI ── */}
        {/* harness.yaml → Desktop App */}
        <Arrow
          x1={HY.x + 90} y1={HY.y + HY.h}
          x2={DA.x + DA.w / 2} y2={DA.y}
          label="manages" labelX={160} labelY={HY.y + HY.h + 18}
        />
        {/* harness.yaml → CLI */}
        <Arrow
          x1={HY.x + HY.w - 90} y1={HY.y + HY.h}
          x2={CL.x + CL.w / 2} y2={CL.y}
          label="compile / validate" labelX={540} labelY={HY.y + HY.h + 18}
        />

        {/* ── Desktop App ── */}
        <rect x={DA.x} y={DA.y} width={DA.w} height={DA.h} rx={10}
          fill={SURFACE_MID} stroke={CYAN_DIM} strokeWidth={1} />

        <Label x={DA.x + DA.w / 2} y={DA.y + 14}>DESKTOP APP</Label>

        {desktopGroups.map((g, gi) => {
          const gy = DA.y + 26 + gi * 47;
          return (
            <g key={g.label}>
              {/* group label */}
              <text x={DA.x + 12} y={gy + 10}
                fontFamily={FONT} fontSize={7.5} fontWeight={700}
                letterSpacing="0.09em" fill={SUBTLE}>
                {g.label}
              </text>
              {/* chips */}
              {g.items.map((item, ii) => {
                const chipX = DA.x + 12 + ii * 66;
                return (
                  <g key={item}>
                    <rect x={chipX} y={gy + 15} width={62} height={18} rx={4}
                      fill={SURFACE} stroke={BORDER} />
                    <text x={chipX + 31} y={gy + 27}
                      fontFamily={FONT} fontSize={9} fill={MUTED}
                      textAnchor="middle">
                      {item}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* ── CLI ── */}
        <rect x={CL.x} y={CL.y} width={CL.w} height={CL.h} rx={10}
          fill={SURFACE_MID} stroke={BORDER} strokeWidth={1} />

        <Label x={CL.x + CL.w / 2} y={CL.y + 14}>CLI — harness-kit</Label>

        <text x={CL.x + CL.w / 2} y={CL.y + 32}
          fontFamily={FONT} fontSize={9} fill={SUBTLE} textAnchor="middle">
          standalone terminal tool
        </text>

        {/* command chips — two rows of 3 */}
        {cliCommands.map((cmd, i) => {
          const col = i % 3;
          const row = Math.floor(i / 3);
          const cx = CL.x + 12 + col * 74;
          const cy = CL.y + 44 + row * 26;
          return (
            <g key={cmd}>
              <rect x={cx} y={cy} width={68} height={18} rx={4}
                fill={SURFACE} stroke={BORDER} />
              <text x={cx + 34} y={cy + 12}
                fontFamily={MONO} fontSize={9} fill={MUTED}
                textAnchor="middle">
                {cmd}
              </text>
            </g>
          );
        })}

        {/* ── Arrow: CLI → Native Configs ── */}
        <Arrow
          x1={CL.x + CL.w / 2} y1={CL.y + CL.h}
          x2={CC.x + CC.w / 2} y2={CC.y}
          label="compiles to" labelX={CL.x + CL.w / 2 + 8} labelY={CL.y + CL.h + 18}
        />

        {/* ── Native Configs ── */}
        <rect x={CC.x} y={CC.y} width={CC.w} height={CC.h} rx={10}
          fill={SURFACE} stroke={BORDER} strokeWidth={1} />

        <Label x={CC.x + CC.w / 2} y={CC.y + 14}>NATIVE CONFIGS</Label>

        {/* config targets */}
        {['.claude/settings.json', '.cursor/rules', 'copilot config'].map((c, i) => (
          <text key={c}
            x={CC.x + CC.w / 2} y={CC.y + 32 + i * 14}
            fontFamily={MONO} fontSize={9} fill={SUBTLE}
            textAnchor="middle">
            {c}
          </text>
        ))}

        {/* ── Arrow: Native Configs → AI Tools ── */}
        <Arrow
          x1={CC.x + CC.w / 2 - 20} y1={CC.y + CC.h}
          x2={AT.x + AT.w - 40} y2={AT.y}
          label="loads into" labelX={520} labelY={CC.y + CC.h + 32}
          dashed
        />

        {/* ── Plugin System ── */}
        <rect x={PS.x} y={PS.y} width={PS.w} height={PS.h} rx={10}
          fill={SURFACE_MID} stroke={BORDER} strokeWidth={1} />

        <Label x={PS.x + PS.w / 2} y={PS.y + 14}>PLUGIN SYSTEM</Label>

        {pluginParts.map((p, i) => {
          const col = i % 2;
          const row = Math.floor(i / 2);
          const px = PS.x + 12 + col * 116;
          const py = PS.y + 26 + row * 26;
          return (
            <g key={p.name}>
              <rect x={px} y={py} width={110} height={20} rx={4}
                fill={SURFACE}
                stroke={p.highlight ? CYAN_DIM : BORDER} />
              <text x={px + 6} y={py + 13}
                fontFamily={MONO} fontSize={9}
                fill={p.highlight ? CYAN : MUTED}>
                {p.name}
              </text>
              <text x={px + 54} y={py + 13}
                fontFamily={FONT} fontSize={8.5}
                fill={SUBTLE}>
                {p.desc}
              </text>
            </g>
          );
        })}

        {/* ── Arrow: Plugin System → AI Tools (installed via harness.yaml, runs in AI tool) ── */}
        <Arrow
          x1={PS.x + PS.w} y1={PS.y + PS.h / 2}
          x2={AT.x} y2={AT.y + AT.h / 2}
          label="runs in" labelX={(PS.x + PS.w + AT.x) / 2} labelY={AT.y + AT.h / 2 - 8}
        />

        {/* ── AI Tools ── */}
        <rect x={AT.x} y={AT.y} width={AT.w} height={AT.h} rx={10}
          fill={SURFACE_MID} stroke={BORDER} strokeWidth={1} />

        <Label x={AT.x + AT.w / 2} y={AT.y + 14}>AI TOOLS</Label>

        {aiTools.map((tool, i) => {
          const tx = AT.x + 12 + (i % 3) * 76;
          const ty = AT.y + 24 + Math.floor(i / 3) * 24;
          return (
            <g key={tool}>
              <rect x={tx} y={ty} width={70} height={17} rx={4}
                fill={SURFACE} stroke={BORDER} />
              <text x={tx + 35} y={ty + 11.5}
                fontFamily={FONT} fontSize={8.5} fill={MUTED}
                textAnchor="middle">
                {tool}
              </text>
            </g>
          );
        })}

        {/* ── Session data feedback arrow: AI Tools → Desktop App Observatory ── */}
        {/* Path: left edge of AI Tools → go left → go up → right edge of Desktop App */}
        <defs>
          <marker id="arr-feedback" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0,8 3,0 6" fill={SUBTLE} opacity={0.5} />
          </marker>
        </defs>
        <path
          d={`M${AT.x},${AT.y + AT.h / 2} L${AT.x - 28},${AT.y + AT.h / 2} L${AT.x - 28},${DA.y + DA.h / 2} L${DA.x + DA.w},${DA.y + DA.h / 2}`}
          fill="none"
          stroke={SUBTLE}
          strokeWidth={1}
          strokeDasharray="4 3"
          markerEnd="url(#arr-feedback)"
          opacity={0.4}
        />
        <text
          x={AT.x - 50} y={(AT.y + AT.h / 2 + DA.y + DA.h / 2) / 2}
          fontFamily={FONT} fontSize={8.5} fill={SUBTLE}
          textAnchor="middle" opacity={0.6}
          transform={`rotate(-90, ${AT.x - 50}, ${(AT.y + AT.h / 2 + DA.y + DA.h / 2) / 2})`}
        >
          session data
        </text>

      </svg>
    </div>
  );
}
