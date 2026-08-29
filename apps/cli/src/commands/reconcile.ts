import { buildReconciliationContext, summarizePlan } from "./portability-common.js";

interface ReconcileFlags {
  organization?: string;
  personal?: string;
  session?: string;
  target?: string;
  resolve?: string[];
  json?: boolean;
}

export async function reconcileCommand(path: string, flags: ReconcileFlags): Promise<void> {
  const context = await buildReconciliationContext(path, flags);
  const summary = summarizePlan(context.plan);
  if (flags.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Reconciliation: ${context.plan.operations.length} operation(s), ${context.plan.conflicts.length} conflict(s).`);
    for (const operation of context.plan.operations) {
      if (operation.direction !== "noop") {
        console.log(`  ${operation.direction.padEnd(16)} ${operation.identity.kind}:${operation.alias} (${operation.identity.source})`);
      }
    }
    for (const conflict of context.plan.conflicts) {
      console.log(`  CONFLICT ${conflict.id}`);
      console.log(`    ${conflict.detail}`);
      console.log(`    scope=${conflict.scope} targets=${conflict.affectedTargets.join(",")} choices=${conflict.allowedResolutions.join(",")}`);
    }
    for (const report of context.plan.losses) {
      for (const loss of report.losses) {
        console.log(`  LOSS ${report.target} ${loss.resource.kind}:${loss.resource.name} ${loss.capability} — ${loss.detail}`);
      }
    }
  }
  if (context.plan.blocked) process.exitCode = 2;
}
