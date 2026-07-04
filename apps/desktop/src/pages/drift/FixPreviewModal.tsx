import { useEffect, useState } from "react";
import { buildFixPlan, applyFix, type FixPlan } from "@harness-kit/core";
import { Modal, Button, DiffViewer } from "@harness-kit/ui";
import type { ScopedDriftItem } from "./drift-data";
import { lineDiff, collapseToHunks } from "./line-diff";

export interface FixPreviewModalProps {
  open: boolean;
  onClose: () => void;
  /** One item, or every repairable item in a scope for "Fix all". */
  targets: ScopedDriftItem[];
  onApplied: () => void;
}

/**
 * Dry-run preview before ANY fix is applied (DESIGN.md: "Fix all... dry-run
 * preview first"; per-item Fix "opens a Modal previewing the exact FixPlan
 * before applying"). Builds one FixPlan per distinct scope (a plan is scoped
 * to a single FsProvider/cwd), shows every file that will change, then
 * applies all plans only on explicit confirm.
 */
export function FixPreviewModal({ open, onClose, targets, onApplied }: FixPreviewModalProps) {
  const [plans, setPlans] = useState<{ scopeLabel: string; scopeRoot: string; fs: ScopedDriftItem["scope"]["fs"]; plan: FixPlan }[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || targets.length === 0) {
      setPlans(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const byScope = new Map<string, ScopedDriftItem[]>();
        for (const t of targets) {
          const list = byScope.get(t.scope.root) ?? [];
          list.push(t);
          byScope.set(t.scope.root, list);
        }
        const built = await Promise.all(
          [...byScope.entries()].map(async ([scopeRoot, items]) => {
            const plan = await buildFixPlan(items.map((i) => i.item), items[0].scope.fs);
            return { scopeLabel: items[0].scope.label, scopeRoot, fs: items[0].scope.fs, plan };
          }),
        );
        if (!cancelled) setPlans(built.filter((b) => b.plan.changes.length > 0));
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, targets]);

  async function handleApply() {
    if (!plans) return;
    setApplying(true);
    setError(null);
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      for (const { fs, plan } of plans) {
        await applyFix(plan, { fs, timestamp });
      }
      onApplied();
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setApplying(false);
    }
  }

  const totalFiles = plans?.reduce((sum, p) => sum + p.plan.changes.length, 0) ?? 0;
  const title = targets.length > 1 ? `Fix ${targets.length} items` : "Fix item";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={applying}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleApply}
            disabled={applying || loading || !plans || totalFiles === 0}
          >
            {applying ? "Applying…" : `Apply fix to ${totalFiles} file${totalFiles === 1 ? "" : "s"}`}
          </Button>
        </>
      }
    >
      {loading && <p style={{ fontSize: 12.5, color: "var(--fg-subtle)" }}>Building fix plan…</p>}
      {error && <div className="hk-page-error">{error}</div>}
      {!loading && plans && totalFiles === 0 && (
        <p style={{ fontSize: 12.5, color: "var(--fg-subtle)" }}>
          Nothing to fix — these items have no repairable changes.
        </p>
      )}
      {!loading &&
        plans?.map(({ scopeLabel, scopeRoot, plan }) => (
          <div key={scopeRoot} style={{ marginBottom: 18 }}>
            {plans.length > 1 && (
              <div style={{ fontSize: 11, fontWeight: 650, color: "var(--fg-subtle)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {scopeLabel}
              </div>
            )}
            {plan.changes.map((change) => (
              <div key={change.path} style={{ marginBottom: 12 }}>
                <div className="hk-table-mono" style={{ fontSize: 11.5, color: "var(--fg-muted)", marginBottom: 6 }}>
                  {change.path} — {change.operation}
                </div>
                <DiffViewer lines={collapseToHunks(lineDiff(change.before, change.after))} />
              </div>
            ))}
          </div>
        ))}
    </Modal>
  );
}
