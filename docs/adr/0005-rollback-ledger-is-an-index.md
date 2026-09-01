# ADR 0005 — The rollback ledger is an index over `~/.harness/backups/`

**Status:** Accepted · **Date:** 2026-09-01 · Relates to D10, AC-32, AC-33

## Context

Every apply — CLI or desktop — writes preimage backups and a manifest to
`~/.harness/backups/<ts>/` (project-scope applies to `.harness/backups/`). A
`transactions` table in `~/.harness/harness.db` records where that material
is, so `harness-kit rollback --list` can enumerate rollback points.

Making the desktop record into that table required a second writer against a
database the CLI already owns. That is the highest-risk shape available, and
it earned the reputation immediately: the first implementation let a *read*
destroy the ledger, and a whole-change review then found the same hazard still
live on the CLI side.

A holistic review raised the obvious objection: the app already enumerates
rollback points without SQL. `apps/desktop/src/pages/fleet/portability-data.ts`
lists `.harness/backups` directly, in eight lines. The manifests are
timestamp-named, sortable, and already parsed by `rollback` to execute a
restore. Everything `--list` prints is the directory name, the manifest
contents, or implied by which root was scanned. The table buys ordering and
`surfaces`/`kinds` display strings.

## Decision

Keep the table, and treat it as **an index over the filesystem, not the source
of truth**.

1. `~/.harness/backups/` is authoritative. A rollback point exists because its
   manifest exists, not because a row does.
2. The ledger may be rebuilt from that directory at any time. Losing it costs
   history and convenience, never recoverability.
3. Both writers therefore degrade rather than fail: an apply that could not be
   recorded still committed, and the caller says so.
4. Migrations on `transactions` stay additive, because the CLI and app update
   independently (Homebrew formula vs. cask) and version skew is guaranteed.

## Consequences

Two implementations of one migration remain, which is the cost. It is bounded
by the schema living in a single source (`packages/core/src/state/schema.ts`),
generated into the Rust artifact and drift-tested in CI, and by the harder
logic — the transaction engine itself — being genuinely shared rather than
reimplemented.

**Exit path, stated in advance:** if this shape produces further
data-integrity defects, delete the `transactions` table and derive `--list` by
scanning `~/.harness/backups/` and `.harness/backups/`. The information is
already there; only ordering and display strings would need recomputing.
Choosing that later costs a migration, not a redesign — which is precisely why
the table is an index and not a store of record.

**Known gap this creates:** when the database is unusable, `--list` degrades
to `.harness/state.json`, which is project-scoped only — so home-scope
rollback points (every desktop apply) disappear from the listing even though
their manifests are on disk. The directory scan above is the fix, and it is
the first thing to build if this decision is revisited.
