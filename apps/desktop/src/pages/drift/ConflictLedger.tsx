import { StatusChip } from "@harness-kit/ui";
import type { ReconciliationConflict } from "@harness-kit/core";

export function ConflictLedger({ conflicts }: { conflicts: ReconciliationConflict[] }) {
  if (conflicts.length === 0) return null;
  return (
    <section className="hk-conflict-ledger" aria-labelledby="conflict-ledger-title">
      <div className="hk-conflict-ledger-title">
        <div>
          <p>Requires a decision</p>
          <h2 id="conflict-ledger-title">{conflicts.length} reconciliation conflict{conflicts.length === 1 ? "" : "s"}</h2>
        </div>
        <StatusChip variant="danger">apply blocked</StatusChip>
      </div>
      {conflicts.map((conflict) => {
        const revision = conflict.desired?.revision ?? conflict.current?.revision ?? conflict.base?.revision;
        const provenance = conflict.desired?.provenance ?? conflict.current?.provenance ?? conflict.base?.provenance;
        return (
          <article key={conflict.id}>
            <div className="hk-conflict-main">
              <code>{conflict.identity.kind}:{conflict.alias}</code>
              <p>{conflict.detail}</p>
            </div>
            <dl>
              <div><dt>scope</dt><dd>{conflict.scope}</dd></div>
              <div><dt>source</dt><dd>{conflict.identity.source}</dd></div>
              <div><dt>version</dt><dd>{revision?.resolvedRevision ?? revision?.requestedVersion ?? "local"}</dd></div>
              <div><dt>digest</dt><dd>{revision?.digest?.slice(0, 20) ?? "unlocked"}</dd></div>
              <div><dt>provenance</dt><dd>{provenance?.file ?? provenance?.adapter ?? "native peer"}</dd></div>
              <div><dt>targets</dt><dd>{conflict.affectedTargets.join(", ")}</dd></div>
            </dl>
            <div className="hk-conflict-choices">
              {conflict.allowedResolutions.map((choice) => <span key={choice}>{choice}</span>)}
            </div>
          </article>
        );
      })}
    </section>
  );
}
