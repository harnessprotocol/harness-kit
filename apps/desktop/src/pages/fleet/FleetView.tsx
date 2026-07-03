import {
  Button,
  SummaryStrip,
  Table,
  StatusChip,
  EmptyState,
  type StatusChipVariant,
  type TableColumn,
  type SummaryCell,
} from "@harness-kit/ui";
import { FolderSearch } from "lucide-react";
import type { FleetReport, FleetStatus } from "@harness-kit/core";
import type { HarnessInfo } from "@harness-kit/shared";
import { ADAPTER_META, versionForAdapter } from "./adapter-meta";

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const STATUS_LABEL: Record<FleetStatus, string> = {
  "in-sync": "In sync",
  drift: "Drift",
  "not-configured": "Not configured",
  "not-installed": "Not installed",
};

const STATUS_VARIANT: Record<FleetStatus, StatusChipVariant> = {
  "in-sync": "success",
  drift: "warning",
  "not-configured": "subtle",
  "not-installed": "subtle",
};

interface FleetRowView {
  adapterId: string;
  name: string;
  monogram: string;
  version?: string;
}

export interface FleetViewProps {
  report: FleetReport | null;
  harnesses: HarnessInfo[];
  loading: boolean;
  recompiling: boolean;
  error: string | null;
  lastCompiled: string | null;
  projectTracked: boolean;
  onRecompileAll: () => void;
  onScan: () => void;
  onNavigateToConfigure: (scopeRoot: string) => void;
  onNavigateToDrift: (adapterId: string) => void;
}

/**
 * Pure presentational Fleet view (DESIGN.md §6.3 "Fleet"). Split out from
 * FleetPage so it can be rendered with fixture data for Playwright
 * screenshots without needing a live Tauri/core backend.
 */
export function FleetView({
  report,
  harnesses,
  loading,
  recompiling,
  error,
  lastCompiled,
  projectTracked,
  onRecompileAll,
  onScan,
  onNavigateToConfigure,
  onNavigateToDrift,
}: FleetViewProps) {
  if (loading && !report) {
    return (
      <div className="hk-page">
        <div className="hk-page-head">
          <div>
            <h1 className="hk-page-title">Fleet</h1>
            <p className="hk-page-subtitle">
              Every harness on this machine, and how far each has drifted from your source of truth.
            </p>
          </div>
        </div>
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-subtle)", fontSize: 12.5 }}>
          Scanning this machine…
        </div>
      </div>
    );
  }

  const allNotInstalled =
    report &&
    report.rows.length > 0 &&
    report.rows.every((r) => Object.values(r.cells).every((c) => c.status === "not-installed"));

  if (!report || allNotInstalled) {
    return (
      <div className="hk-page">
        <EmptyState
          icon={<FolderSearch size={28} strokeWidth={1.5} />}
          title="Scan this machine"
          description="Harness Kit hasn't found any installed AI coding harnesses yet. Scan to see what's installed, what's configured, and what's drifted from harness.yaml."
          action={
            <Button variant="primary" onClick={onScan}>
              Scan this machine
            </Button>
          }
        />
      </div>
    );
  }

  const rows: FleetRowView[] = report.rows.map((r) => ({
    adapterId: r.adapter,
    name: ADAPTER_META[r.adapter]?.name ?? r.adapter,
    monogram: ADAPTER_META[r.adapter]?.monogram ?? r.adapter.slice(0, 2).toUpperCase(),
    version: versionForAdapter(r.adapter, harnesses),
  }));

  const columns: TableColumn<FleetRowView>[] = [
    {
      id: "harness",
      header: "Harness",
      render: (row) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            className="hk-table-mono"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 26,
              height: 26,
              borderRadius: 6,
              background: "var(--bg-elevated)",
              color: "var(--accent-text)",
              fontSize: 10.5,
              fontWeight: 650,
              flexShrink: 0,
            }}
          >
            {row.monogram}
          </span>
          <span style={{ fontSize: 12.5, color: "var(--fg-base)" }}>{row.name}</span>
          {row.version && (
            <span className="hk-table-mono" style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}>
              v{row.version}
            </span>
          )}
        </div>
      ),
    },
    ...report.scopes.map((scope) => ({
      id: scope.root,
      header: scope.label,
      align: "center" as const,
      render: (row: FleetRowView) => {
        const cell = report.rows.find((r) => r.adapter === row.adapterId)?.cells[scope.root];
        if (!cell) return null;
        return (
          <button
            type="button"
            className="hk-reset-btn"
            onClick={(e) => {
              e.stopPropagation();
              onNavigateToConfigure(scope.root);
            }}
            style={{ cursor: "pointer" }}
            title={cell.detail}
          >
            <StatusChip variant={STATUS_VARIANT[cell.status]}>
              {cell.status === "drift" ? `Drift ${cell.driftCount}` : STATUS_LABEL[cell.status]}
            </StatusChip>
          </button>
        );
      },
    })),
  ];

  const summaryCells: SummaryCell[] = [
    { id: "harnesses", label: "Harnesses", value: String(rows.length) },
    { id: "projects", label: "Projects tracked", value: String(projectTracked ? 1 : 0) },
    {
      id: "drifted",
      label: "Drifted",
      value: String(report.summary.drift),
      tone: report.summary.drift > 0 ? "warning" : "default",
    },
    {
      id: "coverage",
      label: "Coverage",
      value: `${Math.round(
        ((report.summary.inSync + report.summary.drift) /
          Math.max(
            1,
            report.summary.inSync + report.summary.drift + report.summary.notConfigured + report.summary.notInstalled,
          )) *
          100,
      )}%`,
    },
    { id: "last-compiled", label: "Last compiled", value: relativeTime(lastCompiled) },
  ];

  return (
    <div className="hk-page">
      <div className="hk-page-head">
        <div>
          <h1 className="hk-page-title">Fleet</h1>
          <p className="hk-page-subtitle">
            Every harness on this machine, and how far each has drifted from your source of truth.
          </p>
        </div>
        <Button variant="primary" onClick={onRecompileAll} disabled={recompiling}>
          {recompiling ? "Recompiling…" : "Recompile all"}
        </Button>
      </div>

      {error && <div className="hk-page-error">{error}</div>}

      <SummaryStrip cells={summaryCells} />

      <div style={{ marginTop: 20, overflowX: "auto" }}>
        <Table
          columns={columns}
          rows={rows}
          rowKey={(row) => row.adapterId}
          onRowClick={(row) => onNavigateToDrift(row.adapterId)}
        />
      </div>
    </div>
  );
}
