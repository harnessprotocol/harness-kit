import rawMatrix from '@/lib/capability-matrix.generated.json';

type CapabilityLevel = 'native' | 'translated' | 'source-only' | 'unsupported' | 'not-applicable';

interface CapabilityCell {
  resource: string;
  operations: Record<'capture' | 'apply' | 'reconcile' | 'rollback', CapabilityLevel>;
  scopes: Record<'organization' | 'personal' | 'project' | 'session', CapabilityLevel>;
  note?: string;
}

interface CapabilityRow {
  id: string;
  label: string;
  family: string;
  cells: CapabilityCell[];
}

interface CapabilityMatrixData {
  generatedAt: string;
  resources: { id: string; label: string }[];
  rows: CapabilityRow[];
}

// Build-time JSON import — TS widens the string-literal `export`/`import`
// fields to `string`, so re-assert the shape the generator actually emits
// (see packages/website-data/src/generate-capability-matrix.ts).
const matrix = rawMatrix as unknown as CapabilityMatrixData;

const LABEL: Record<CapabilityLevel, string> = {
  native: 'Native',
  translated: 'Translated',
  'source-only': 'Source only',
  unsupported: 'Unsupported',
  'not-applicable': 'Not applicable',
};

/** Contiguous product-family column groups, in row order (rows are family-sorted upstream). */
function familyGroups(rows: CapabilityRow[]): { family: string; span: number }[] {
  const groups: { family: string; span: number }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.family === row.family) last.span += 1;
    else groups.push({ family: row.family, span: 1 });
  }
  return groups;
}

function Chip({ value, title }: { value: CapabilityLevel; title: string }) {
  return (
    <span className={`cap-chip cap-chip-${value}`} title={title}>
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
        <table className="w-full min-w-[1480px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th
                className="sticky left-0 z-10 px-4 pt-3 pb-1"
                style={{ background: 'var(--bg-elevated)' }}
                aria-hidden="true"
              />
              {familyGroups(matrix.rows).map((group) => (
                <th
                  key={group.family}
                  colSpan={group.span}
                  className="px-4 pt-3 pb-1 text-left text-[0.65rem] font-semibold uppercase tracking-[0.12em]"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--fg-subtle)' }}
                >
                  {group.family}
                </th>
              ))}
            </tr>
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
            {matrix.resources.map((resource, i) => (
              <tr key={resource.id}>
                <td
                  className="sticky left-0 z-10 px-4 py-2.5 font-medium"
                  style={{
                    background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-base)',
                    color: 'var(--fg-base)',
                  }}
                >
                  {resource.label}
                </td>
                {matrix.rows.map((row) => {
                  const cell = row.cells.find((c) => c.resource === resource.id)!;
                  const title = [
                    `Apply: ${LABEL[cell.operations.apply]}`,
                    `Capture: ${LABEL[cell.operations.capture]}`,
                    `Reconcile: ${LABEL[cell.operations.reconcile]}`,
                    `Rollback: ${LABEL[cell.operations.rollback]}`,
                    `Scopes: ${Object.entries(cell.scopes).map(([scope, level]) => `${scope}=${LABEL[level]}`).join(', ')}`,
                    cell.note,
                  ].filter(Boolean).join('. ');
                  return (
                    <td
                      key={row.id}
                      className="px-4 py-2.5"
                      style={{ background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-base)' }}
                    >
                      {cell.operations.apply === 'not-applicable' ? (
                        <span
                          title={cell.note ?? 'Not applicable: this harness has no concept of this resource kind'}
                          style={{ color: 'var(--fg-subtle)' }}
                          aria-label="Not applicable"
                        >
                          &mdash;
                        </span>
                      ) : (
                        <Chip value={cell.operations.apply} title={title} />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs leading-relaxed" style={{ color: 'var(--fg-subtle)' }}>
        Apply support is shown; hover a cell for capture, reconciliation, rollback, scope, and loss details.
        Generated at build time from the exhaustive portability registry in{' '}
        <code className="rounded px-1 py-0.5 font-mono" style={{ background: 'var(--bg-elevated)' }}>
          @harness-kit/core
        </code>
        , not hand-maintained — <span style={{ color: 'var(--fg-base)' }}>source-only and unsupported are deliberate</span>:
        every tool&apos;s real limits, without invented native support.
      </p>
    </div>
  );
}
