import { useState } from "react";
import { StatusChip } from "@harness-kit/ui";
import type { DesktopPortabilitySnapshot } from "./portability-data";

export function PortabilityPanel({ snapshot }: { snapshot: DesktopPortabilitySnapshot | null }) {
  const [view, setView] = useState<"apply" | "capture" | "capabilities" | "rollout">("apply");
  if (!snapshot) return null;
  const tabs = ["apply", "capture", "capabilities", "rollout"] as const;

  return (
    <section className="hk-portability" aria-labelledby="portability-heading">
      <div className="hk-portability-head">
        <div>
          <p className="hk-portability-kicker">Reconciliation ledger</p>
          <h2 id="portability-heading">Portable intent ↔ native state</h2>
        </div>
        <div className="hk-portability-tabs" role="tablist" aria-label="Portability preview">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={view === tab}
              className={view === tab ? "is-active" : ""}
              onClick={() => setView(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="hk-portability-ledger">
        <div><span>Layers</span><strong>{snapshot.layers.map((layer) => layer.scope).join(" → ") || "project"}</strong></div>
        <div><span>Conflicts</span><strong data-tone={snapshot.conflicts.length ? "danger" : "quiet"}>{snapshot.conflicts.length}</strong></div>
        <div><span>Portability notices</span><strong>{snapshot.lossCount}</strong></div>
        <div><span>Rollback points</span><strong>{snapshot.rollbackHistory.length}</strong></div>
      </div>

      {view === "apply" && (
        <div className="hk-portability-body">
          <div className="hk-portability-measure">
            <strong>{snapshot.applyPreview.createsOrUpdates}</strong>
            <span>native changes ready</span>
          </div>
          <p>
            {snapshot.applyPreview.captures} peer change(s) would be captured and {snapshot.applyPreview.deletions} deletion(s) reconciled.
            {snapshot.conflicts.length > 0 ? " Resolve every conflict before any file changes." : " The transaction is conflict-free."}
          </p>
        </div>
      )}
      {view === "capture" && (
        <div className="hk-portability-body">
          <div className="hk-portability-measure"><strong>{snapshot.capturePreview.resources}</strong><span>resources discovered</span></div>
          <p>Capture spans {snapshot.capturePreview.targets} target harnesses. Credential values are externalized before a profile is written.</p>
        </div>
      )}
      {view === "capabilities" && (
        <div className="hk-portability-body hk-capability-line">
          {Object.entries(snapshot.capabilityTotals).map(([level, count]) => (
            <div key={level}><StatusChip variant={level === "unsupported" ? "danger" : level === "source-only" ? "warning" : "subtle"}>{level}</StatusChip><strong>{count}</strong></div>
          ))}
        </div>
      )}
      {view === "rollout" && (
        <div className="hk-portability-body">
          <StatusChip variant="subtle">{snapshot.rollout.status}</StatusChip>
          <p>{snapshot.rollout.detail}</p>
          {snapshot.rollbackHistory[0] && <code>latest local rollback: {snapshot.rollbackHistory[0]}</code>}
        </div>
      )}
    </section>
  );
}
