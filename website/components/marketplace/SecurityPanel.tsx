import type { MarketplaceFinding, MarketplaceSecurity } from '@/lib/marketplace/types';
import { TrustBadge } from './TrustBadge';

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#ef4444',
  warning: '#f59e0b',
  info: 'var(--fg-subtle)',
};

function PermissionRow({ label, value, on }: { label: string; value: string; on: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-fd-border/40 py-2 last:border-0">
      <span className="text-sm text-fd-muted-foreground">{label}</span>
      <span
        className="text-sm font-medium"
        style={{ color: on ? 'var(--fg-base)' : 'var(--fg-subtle)' }}
      >
        {value}
      </span>
    </div>
  );
}

function FindingItem({ finding }: { finding: MarketplaceFinding }) {
  const color = SEVERITY_COLOR[finding.severity] ?? 'var(--fg-subtle)';
  return (
    <li className="rounded-lg border border-fd-border/50 p-3" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color }}>
          {finding.severity}
        </span>
        {finding.filePath && (
          <span className="font-mono text-[11px] text-fd-muted-foreground">
            {finding.filePath}
            {finding.lineNumber ? `:${finding.lineNumber}` : ''}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-fd-foreground">{finding.message}</p>
      {finding.recommendation && (
        <p className="mt-1 text-xs leading-relaxed text-fd-muted-foreground">{finding.recommendation}</p>
      )}
    </li>
  );
}

export function SecurityPanel({ security }: { security: MarketplaceSecurity }) {
  const { permissions, findings } = security;
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="font-display text-lg font-semibold text-fd-foreground">Security &amp; permissions</h2>
        <TrustBadge tier={security.trust} />
        <span className="text-sm text-fd-muted-foreground">{security.summary}</span>
      </div>

      <div className="rounded-xl border border-fd-border/50 bg-fd-card/40 px-4 py-1">
        <PermissionRow label="Network access" value={permissions.networkAccess ? 'Yes' : 'No'} on={permissions.networkAccess} />
        <PermissionRow label="File writes" value={permissions.fileWrites ? 'Yes' : 'No'} on={permissions.fileWrites} />
        <PermissionRow
          label="Environment variables"
          value={permissions.envVarReads.length ? permissions.envVarReads.join(', ') : 'None'}
          on={permissions.envVarReads.length > 0}
        />
        <PermissionRow
          label="External URLs"
          value={permissions.externalUrls.length ? String(permissions.externalUrls.length) : 'None'}
          on={permissions.externalUrls.length > 0}
        />
        <PermissionRow
          label="Filesystem patterns"
          value={permissions.filesystemPatterns.length ? permissions.filesystemPatterns.join(', ') : 'None'}
          on={permissions.filesystemPatterns.length > 0}
        />
      </div>

      {findings.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {findings.map((f, i) => (
            <FindingItem key={`${f.category}-${i}`} finding={f} />
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs text-fd-muted-foreground">
        Scanned at build time from source.{' '}
        <a href="/docs/concepts/trust-signals" className="underline">
          How trust signals work →
        </a>
      </p>
    </section>
  );
}
