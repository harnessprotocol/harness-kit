import rawMatrix from '@/lib/capability-matrix.generated.json';

type FeatureSupport = 'full' | 'partial' | 'none';

interface CapabilityCell {
  domain: string;
  export: FeatureSupport;
  import: FeatureSupport;
}

interface CapabilityRow {
  id: string;
  label: string;
  scopes: string[];
  diff: boolean;
  cells: CapabilityCell[];
}

interface CapabilityMatrixData {
  generatedAt: string;
  domains: { id: string; label: string }[];
  rows: CapabilityRow[];
}

// Build-time JSON import — TS widens the string-literal `export`/`import`
// fields to `string`, so re-assert the shape the generator actually emits
// (see packages/website-data/src/generate-capability-matrix.ts).
const matrix = rawMatrix as unknown as CapabilityMatrixData;

const LABEL: Record<FeatureSupport, string> = {
  full: 'Full',
  partial: 'Partial',
  none: 'None',
};

function Chip({ value }: { value: FeatureSupport }) {
  return (
    <span className={`cap-chip cap-chip-${value}`}>
      <span className="cap-chip-dot" aria-hidden="true" />
      {LABEL[value]}
    </span>
  );
}

/**
 * Renders the export-capability matrix for every first-class adapter target,
 * straight from `capability-matrix.generated.json` — a build-time snapshot
 * of `@harness-kit/core`'s adapter `capabilities` declarations (see
 * `packages/website-data/src/generate-capability-matrix.ts`). Nothing here
 * is hand-authored: if an adapter's capabilities change, this table changes
 * on the next generate + build, never the other way around.
 */
export function CapabilityMatrix() {
  return (
    <div className="w-full">
      <div className="overflow-x-auto rounded-xl" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th
                className="sticky left-0 z-10 px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.07em]"
                style={{ background: 'var(--bg-elevated)', color: 'var(--fg-subtle)' }}
              >
                Domain
              </th>
              {matrix.rows.map((row) => (
                <th
                  key={row.id}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.07em]"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--fg-subtle)' }}
                >
                  {row.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.domains.map((domain, i) => (
              <tr key={domain.id}>
                <td
                  className="sticky left-0 z-10 px-4 py-2.5 font-medium"
                  style={{
                    background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-base)',
                    color: 'var(--fg-base)',
                  }}
                >
                  {domain.label}
                </td>
                {matrix.rows.map((row) => {
                  const cell = row.cells.find((c) => c.domain === domain.id)!;
                  return (
                    <td
                      key={row.id}
                      className="px-4 py-2.5"
                      style={{ background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-base)' }}
                    >
                      <Chip value={cell.export} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs leading-relaxed" style={{ color: 'var(--fg-subtle)' }}>
        Export support — what harness.yaml can currently compile into each tool&apos;s native config.
        Generated at build time from each adapter&apos;s declared capabilities in{' '}
        <code className="rounded px-1 py-0.5 font-mono" style={{ background: 'var(--bg-elevated)' }}>
          @harness-kit/core
        </code>
        , not hand-maintained — <span style={{ color: 'var(--fg-base)' }}>partial and none are the point</span>: every
        tool&apos;s real limits, not a marketing gloss.
      </p>
    </div>
  );
}
