import { homedir } from "node:os";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import {
  applyCellAction,
  applyPluginCellAction,
  buildAgentPrompt,
  buildMachineInventory,
  CellActionError,
  createHomeTransactionRoot,
  planCellAction,
  syncCliCommand,
  recordAppliedTransaction,
  SURFACE_IDS,
} from "@harness-kit/core";
import type {
  CellActionPlan,
  HarnessResourceKind,
  MachineGap,
  ObserveOptions,
  SurfaceId,
  SurfaceScope,
  TransactionFileChange,
} from "@harness-kit/core";
import { NodeFsProvider, NodeProcessRunner } from "@harness-kit/core/node";
import { defaultStatePath, SqliteStateStore } from "../state/sqlite-store.js";
import { timestamp } from "./portability-common.js";

export interface SurfaceSyncFlags {
  from?: string;
  to?: string[];
  only?: string | string[];
  scope?: string;
  dryRun?: boolean;
  yes?: boolean;
  json?: boolean;
  /** Emit agent prompts for the selected actions instead of applying them. */
  prompt?: boolean;
  /** Persist generated prompts to this path (AC-35). */
  out?: string;
  /** Include literal secret values in generated prompts (D5). */
  revealSecrets?: boolean;
  /** Retired flags from the pre-M2 `sync`, caught to give a real message. */
  frozen?: boolean;
  locked?: boolean;
}

/** One planned action, in the shape both the report and --json render. */
interface PlannedAction {
  kind: HarnessResourceKind;
  name: string;
  from: SurfaceId;
  to: SurfaceId;
  cli: string;
  plan: CellActionPlan;
}

function assertSurface(value: string, flag: string): SurfaceId {
  if (!(SURFACE_IDS as readonly string[]).includes(value)) {
    throw new Error(`unknown surface for ${flag}: '${value}' (expected one of ${SURFACE_IDS.join(", ")})`);
  }
  return value as SurfaceId;
}

/**
 * `--only mcp-server` or `--only mcp-server:postgres`, one or many.
 *
 * Accepts a bare string as well as an array. Commander only treats an option
 * as variadic when its value name is a plain identifier ending in `...`, and
 * the declaration read `<kind[:name]...>` — so this arrived as a string and
 * `.map` threw, crashing every `sync --only`. The declaration is fixed; this
 * normalizes anyway, because a parser boundary should not depend on a
 * framework's naming heuristics staying the same across versions.
 */
function parseOnly(filters: string | string[] | undefined): Array<{ kind: string; name?: string }> {
  const list = filters === undefined ? [] : Array.isArray(filters) ? filters : [filters];
  return list.map((filter) => {
    const [kind, ...rest] = filter.split(":");
    return { kind: kind!, name: rest.length > 0 ? rest.join(":") : undefined };
  });
}

function matchesOnly(
  filters: Array<{ kind: string; name?: string }>,
  kind: HarnessResourceKind,
  name: string,
): boolean {
  if (filters.length === 0) return true;
  return filters.some(
    (filter) =>
      filter.kind === kind && (filter.name === undefined || filter.name.toLowerCase() === name.toLowerCase()),
  );
}

/**
 * Cross-surface resource sync (AC-27, D13).
 *
 * Bare `sync` REPORTS and writes nothing — it is the machine's gap list with
 * the action each gap would take. Writing requires --yes. This is why the
 * verb could be repurposed without a deprecation alias: an existing scripted
 * `harness-kit sync` now prints a report instead of installing, which fails
 * safe, and the retired --frozen/--locked flags hard-error with the mapping
 * to `install` rather than a generic parse failure (AC-38).
 */
export async function surfaceSyncCommand(flags: SurfaceSyncFlags): Promise<void> {
  if (flags.frozen || flags.locked) {
    const flag = flags.frozen ? "--frozen" : "--locked";
    throw new Error(
      `${flag} belongs to plugin installation, which is now 'harness-kit install'. ` +
        `Run: harness-kit install ${flag}\n` +
        `'harness-kit sync' is now cross-surface resource sync (see --help).`,
    );
  }

  const cwd = resolve(".");
  const home = homedir();
  const platform = process.platform === "win32" ? "win32" : process.platform === "linux" ? "linux" : "darwin";
  const scope: SurfaceScope = flags.scope === "project" ? "project" : "user";
  const opts: ObserveOptions = {
    projectRoot: scope === "project" ? cwd : null,
    homeRoot: home,
    platform,
  };

  const fs = new NodeFsProvider(cwd);
  const inventory = await buildMachineInventory(fs, opts);
  const only = parseOnly(flags.only);
  const from = flags.from ? assertSurface(flags.from, "--from") : undefined;
  const to = (flags.to ?? []).map((value) => assertSurface(value, "--to"));

  // Every gap the filters admit becomes one candidate action.
  const candidates: Array<Omit<PlannedAction, "cli" | "plan">> = [];
  for (const gap of inventory.gaps as MachineGap[]) {
    const row = inventory.rows.find((candidate) => candidate.key === gap.row);
    if (!row || !matchesOnly(only, row.kind, row.name)) continue;
    const sources = from ? gap.presentOn.filter((surface) => surface === from) : gap.presentOn;
    const targets = to.length > 0 ? gap.missingOn.filter((surface) => to.includes(surface)) : gap.missingOn;
    for (const target of targets) {
      const source = sources[0];
      if (!source) continue;
      candidates.push({ kind: row.kind, name: row.name, from: source, to: target });
    }
  }

  // AC-11 covers "any gap OR diff". A diff is a row two surfaces both hold
  // with different content; reconciling it REPLACES the target's version, so
  // it is only ever offered with an explicit direction and, at apply time,
  // the overwrite confirmation `planCellAction` attaches.
  //
  // Without this the desktop printed a `harness-kit sync --only …` command
  // for every diff cell that silently did nothing, because the CLI walked
  // only the gap list.
  const seen = new Set(candidates.map((c) => `${c.kind}:${c.name}:${c.from}:${c.to}`));
  for (const diff of inventory.diffs) {
    const row = inventory.rows.find((candidate) => candidate.key === diff.row);
    if (!row || !matchesOnly(only, row.kind, row.name)) continue;
    // A diff pair is unordered; `--from` picks the winner. Without it there
    // is no basis to choose, and guessing is what AC-11's deferral warned
    // against — so an unfiltered run reports the diff and offers no action.
    if (!from) continue;
    const [left, right] = diff.surfaces;
    if (left !== from && right !== from) continue;
    const other = left === from ? right : left;
    const targets = to.length > 0 ? [other].filter((surface) => to.includes(surface)) : [other];
    for (const target of targets) {
      const key = `${row.kind}:${row.name}:${from}:${target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ kind: row.kind, name: row.name, from, to: target });
    }
  }

  const actions: PlannedAction[] = [];
  for (const candidate of candidates) {
    const plan = await planCellAction(
      fs,
      { kind: candidate.kind, name: candidate.name, from: candidate.from, to: candidate.to, scope },
      opts,
    );
    actions.push({ ...candidate, cli: syncCliCommand({ ...candidate, scope }), plan });
  }

  const actionable = actions.filter((action) => action.plan.supported && !action.plan.noop);

  if (flags.prompt) {
    // Prompts cover cells with no direct-write path too, so this deliberately
    // uses every selected action rather than only the writable ones (AC-13).
    const prompts = actions.map((action) =>
      buildAgentPrompt(
        action.plan,
        { kind: action.kind, name: action.name, from: action.from, to: action.to, scope },
        { revealSecrets: flags.revealSecrets === true },
      ),
    );
    const text = prompts.join("\n---\n\n");
    if (flags.json) console.log(JSON.stringify({ prompts }, null, 2));
    else console.log(text);
    if (flags.out) {
      await writeFile(resolve(flags.out), text, { mode: 0o600 });
      console.log(`\nWritten to ${resolve(flags.out)}`);
    }
    return;
  }

  if (!flags.yes || flags.dryRun) {
    report(actions, flags, scope);
    return;
  }

  // Confirmation gate: --yes is the CLI's explicit confirmation (AC-34).
  const applied: string[] = [];
  const failed: Array<{ cli: string; reason: string }> = [];
  let store: SqliteStateStore | undefined;
  try {
    store = await SqliteStateStore.open(defaultStatePath());
  } catch {
    store = undefined; // Ledger is an index; losing it must not block a write.
  }

  try {
    for (const action of actionable) {
      const stamp = timestamp();
      try {
        // A plugin action drives the surface's own installer; there is no
        // transaction, no preimage and no rollback point, because nothing
        // HarnessKit owns was written. Routing it through the transaction
        // path would apply an empty change set and report success.
        if (action.plan.plugin !== undefined) {
          const outcome = await applyPluginCellAction(action.plan, {
            runner: new NodeProcessRunner(cwd),
            fs,
            now: new Date().toISOString(),
            sourceSurface: action.from,
            homeRoot: home,
            surface: action.to,
            identity: action.name,
            ...(store ? { state: store } : {}),
          });
          if (outcome.status === "refused" || outcome.status === "failed") {
            failed.push({ cli: action.cli, reason: outcome.reason });
          } else {
            applied.push(action.cli);
          }
          continue;
        }
        const applyOptions = {
          homeRoot: home,
          ...(scope === "project" ? { projectRoot: cwd } : {}),
          confirmed: true,
        };
        const result = await applyCellAction(
          action.plan,
          {
            fs,
            timestamp: stamp,
            roots: { home: createHomeTransactionRoot(home, platform) },
          },
          applyOptions,
        );
        // The ledger derives `roots` from the change set, so it needs the
        // real changes — passing [] recorded roots: [] on every row. And the
        // manifest is anchored wherever applyFileTransaction put it: the
        // project root when any change is project-rooted, else home.
        // Hardcoding home made a project-scope apply unrollbackable by id.
        const changes = rebaseForLedger(action.plan.changes, applyOptions);
        await recordAppliedTransaction(result, changes, {
          transactionId: stamp,
          appliedAt: new Date().toISOString(),
          manifestRoot: changes.some((change) => (change.root ?? "project") === "project")
            ? cwd
            : home,
          surfaces: [action.to],
          kinds: [action.kind],
          identityKeys: [`${action.kind}:${action.name.toLowerCase()}`],
        }, store ?? null);
        applied.push(action.cli);
      } catch (error) {
        const reason =
          error instanceof CellActionError ? `${error.code}: ${error.message}` : String(error);
        failed.push({ cli: action.cli, reason });
      }
    }
  } finally {
    try {
      await store?.close();
    } catch {
      // The handle is already unusable; nothing left to release.
    }
  }

  if (flags.json) {
    console.log(JSON.stringify({ applied, failed }, null, 2));
  } else {
    console.log(`Applied ${applied.length} action(s).`);
    for (const failure of failed) console.log(`  failed  ${failure.cli}\n          ${failure.reason}`);
  }
  if (failed.length > 0) throw new Error(`${failed.length} action(s) failed`);
}

/**
 * Rebase a plan's absolute paths onto named roots, mirroring what
 * applyCellAction does internally, so the ledger records the same roots the
 * transaction actually used.
 */
function rebaseForLedger(
  changes: CellActionPlan["changes"],
  options: { homeRoot: string; projectRoot?: string },
): TransactionFileChange[] {
  const candidates = [
    ...(options.projectRoot ? [{ root: "project" as const, base: options.projectRoot }] : []),
    { root: "home" as const, base: options.homeRoot },
  ];
  return changes.map((change) => {
    for (const { root, base } of candidates) {
      const prefix = base.endsWith("/") ? base : `${base}/`;
      if (change.path.startsWith(prefix)) {
        return { root, path: change.path.slice(prefix.length), before: change.before, after: change.after };
      }
    }
    return { path: change.path, before: change.before, after: change.after };
  });
}

function report(actions: PlannedAction[], flags: SurfaceSyncFlags, scope: SurfaceScope): void {
  const rows = actions.map((action) => ({
    kind: action.kind,
    name: action.name,
    from: action.from,
    to: action.to,
    scope,
    status: !action.plan.supported ? "unavailable" : action.plan.noop ? "up-to-date" : "ready",
    reason: action.plan.reason,
    carriesSecret: action.plan.carriesSecret,
    requiresConfirmation: action.plan.requiresConfirmation,
    // Distinct from capability loss. "lossy" means the target cannot express
    // the resource; an overwrite means it holds a DIFFERENT version that this
    // action replaces. Both set requiresConfirmation, and reporting the
    // second as the first told users the opposite of what was happening.
    overwrites: action.plan.overwrites ?? null,
    lossy: (action.plan.loss?.losses.length ?? 0) > 0,
    cli: action.cli,
  }));

  if (flags.json) {
    console.log(JSON.stringify({ actions: rows }, null, 2));
    return;
  }
  if (rows.length === 0) {
    console.log("No gaps to close for the given filters.");
    return;
  }
  console.log(`${rows.length} proposed action(s). Nothing has been written.`);
  for (const row of rows) {
    const badges = [
      row.carriesSecret ? "contains a secret" : null,
      row.lossy ? "lossy" : null,
      row.overwrites ? `replaces ${row.overwrites.length} field(s)` : null,
    ].filter(Boolean);
    console.log(
      `  ${row.status.padEnd(11)} ${row.kind}:${row.name}  ${row.from} → ${row.to}${badges.length ? `  (${badges.join(", ")})` : ""}`,
    );
    if (row.reason) console.log(`              ${row.reason}`);
    // AC-11: never replace content without naming what is replaced.
    if (row.overwrites) {
      for (const delta of row.overwrites) {
        console.log(
          `              replaces ${delta.path}: ${JSON.stringify(delta.left)} → ${JSON.stringify(delta.right)}`,
        );
      }
    }
    console.log(`              ${row.cli}`);
  }
  console.log("\nRe-run with --yes to apply.");
}
