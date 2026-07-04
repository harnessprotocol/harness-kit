import { Button, StatusChip, DiffViewer, EmptyState, ToastViewport, type ToastItem } from "@harness-kit/ui";
import { ShieldCheck } from "lucide-react";
import { ADAPTER_META } from "../fleet/adapter-meta";
import { driftItemKey, type ScopedDriftItem } from "./drift-data";
import { CLASS_LABEL, CLASS_VARIANT, isRepairable } from "./classification";
import { lineDiff, collapseToHunks } from "./line-diff";

function groupKey(entry: ScopedDriftItem): string {
  return `${entry.scope.root}::${entry.item.adapter}`;
}

export interface DriftViewProps {
  entries: ScopedDriftItem[];
  filteredEntries: ScopedDriftItem[];
  acknowledged: Set<string>;
  loading: boolean;
  error: string | null;
  harnessFilter: string | null;
  showAcknowledged: boolean;
  toasts: ToastItem[];
  onToggleShowAcknowledged: () => void;
  onFixAll: () => void;
  onFixOne: (entry: ScopedDriftItem) => void;
  onAcknowledge: (entry: ScopedDriftItem) => void;
  onUnacknowledge: (entry: ScopedDriftItem) => void;
  onRescan: () => void;
  onDismissToast: (id: string) => void;
}

/**
 * Pure presentational Drift view (DESIGN.md §6.3 "Drift"). Split out from
 * DriftPage so it can be rendered with fixture data for Playwright
 * screenshots without needing a live Tauri/core backend, and so the Fix
 * modal's core calls (buildFixPlan/applyFix) stay entirely in DriftPage.
 */
export function DriftView({
  entries,
  filteredEntries,
  acknowledged,
  loading,
  error,
  harnessFilter,
  showAcknowledged,
  toasts,
  onToggleShowAcknowledged,
  onFixAll,
  onFixOne,
  onAcknowledge,
  onUnacknowledge,
  onRescan,
  onDismissToast,
}: DriftViewProps) {
  const visible = filteredEntries.filter((e) => showAcknowledged || !acknowledged.has(driftItemKey(e.scope, e.item)));

  const groups = (() => {
    const map = new Map<string, ScopedDriftItem[]>();
    for (const entry of visible) {
      const key = groupKey(entry);
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  })();

  const repairableCount = filteredEntries.filter((e) => isRepairable(e.item.class)).length;

  if (loading && entries.length === 0) {
    return (
      <div className="hk-page">
        <div className="hk-page-head">
          <div>
            <h1 className="hk-page-title">Drift</h1>
            <p className="hk-page-subtitle">
              Every deployed config file that no longer matches harness.yaml, with a fix for each.
            </p>
          </div>
        </div>
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-subtle)", fontSize: 12.5 }}>
          Scanning for drift…
        </div>
      </div>
    );
  }

  if (!loading && filteredEntries.length === 0) {
    return (
      <div className="hk-page">
        <div className="hk-page-head">
          <div>
            <h1 className="hk-page-title">Drift</h1>
            <p className="hk-page-subtitle">
              Every deployed config file that no longer matches harness.yaml, with a fix for each.
            </p>
          </div>
        </div>
        <EmptyState
          icon={<ShieldCheck size={28} strokeWidth={1.5} />}
          title="No drift detected"
          description="Every deployed config matches harness.yaml across Global and this project. Recompile from Fleet after you next edit harness.yaml to keep it that way."
          action={
            <Button variant="ghost" onClick={onRescan}>
              Re-scan
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="hk-page">
      <div className="hk-page-head">
        <div>
          <h1 className="hk-page-title">Drift</h1>
          <p className="hk-page-subtitle">
            {harnessFilter
              ? `Showing drift for ${ADAPTER_META[harnessFilter as keyof typeof ADAPTER_META]?.name ?? harnessFilter}.`
              : "Every deployed config file that no longer matches harness.yaml, with a fix for each."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <Button variant="ghost" size="sm" onClick={onToggleShowAcknowledged}>
            {showAcknowledged ? "Hide acknowledged" : "Show acknowledged"}
          </Button>
          <Button variant="primary" disabled={repairableCount === 0} onClick={onFixAll}>
            Fix all ({repairableCount})
          </Button>
        </div>
      </div>

      {error && <div className="hk-page-error">{error}</div>}

      {groups.map(([key, groupEntries]) => {
        const first = groupEntries[0];
        const adapterMeta = ADAPTER_META[first.item.adapter];
        return (
          <div key={key} style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-base)" }}>{first.scope.label}</span>
              <span style={{ color: "var(--fg-subtle)", fontSize: 12 }}>›</span>
              <span className="hk-table-mono" style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>
                {adapterMeta?.name ?? first.item.adapter}
              </span>
              <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{groupEntries.length} item(s)</span>
            </div>

            {groupEntries.map((entry) => {
              const itemKey = driftItemKey(entry.scope, entry.item);
              const isAck = acknowledged.has(itemKey);
              const repairable = isRepairable(entry.item.class);
              const diffLines =
                entry.item.expectedContent !== undefined
                  ? collapseToHunks(lineDiff("", entry.item.expectedContent))
                  : null;

              return (
                <div
                  key={itemKey}
                  className="hk-card"
                  style={{ padding: "14px 16px", marginBottom: 10, opacity: isAck ? 0.6 : 1 }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                    <StatusChip variant={CLASS_VARIANT[entry.item.class]}>{CLASS_LABEL[entry.item.class]}</StatusChip>
                    <span className="hk-table-mono" style={{ fontSize: 12, color: "var(--fg-base)" }}>
                      {entry.item.path}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>slot: {entry.item.slot}</span>
                    {isAck && <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>acknowledged</span>}
                    <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexShrink: 0 }}>
                      {repairable ? (
                        <Button variant="primary" size="sm" onClick={() => onFixOne(entry)}>
                          Fix
                        </Button>
                      ) : isAck ? (
                        <Button variant="ghost" size="sm" onClick={() => onUnacknowledge(entry)}>
                          Review again
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => onAcknowledge(entry)}>
                          Acknowledge
                        </Button>
                      )}
                    </div>
                  </div>

                  <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--fg-muted)" }}>{entry.item.detail}</p>

                  {entry.item.class === "user-modified-outside" ? (
                    <p style={{ margin: 0, fontSize: 11.5, color: "var(--fg-subtle)", fontStyle: "italic" }}>
                      This content was edited outside its marker block — it belongs to you. Harness Kit never
                      overwrites it; acknowledge once you've reviewed the change.
                    </p>
                  ) : diffLines ? (
                    <DiffViewer lines={diffLines} />
                  ) : null}
                </div>
              );
            })}
          </div>
        );
      })}

      <ToastViewport toasts={toasts} onDismiss={onDismissToast} />
    </div>
  );
}
