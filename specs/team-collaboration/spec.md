# Spec: Team Collaboration

> **Status: STUB / intent-only.** This captures the *what* and *why* of the team
> direction so the current design anticipates it. It is **not** ready for
> implementation — several foundational questions are unresolved (see
> [NEEDS CLARIFICATION] markers). Do not begin plan-writing until those are
> resolved with the product owner.

## Context

Harness Kit today is **single-user and local**: preferences, harness files, and
project configs live in `localStorage` + the filesystem on one machine. There is
no backend, no accounts, no shared state, and no multi-user concept anywhere in
`apps/desktop` or `packages/core`.

The strategic wedge (see `project_cross_platform_vision` / the Coherence & Focus
initiative) is that the real adoption story is **a team standardizing on one
harness, committed to the repo, and kept in sync across every member's AI tool**.
That is config-as-code for AI harnesses. This spec scopes that future capability.

It is deliberately **out of scope** for the design-system initiative — it needs a
backend that does not exist yet — and is split into its own effort.

## Goals

1. A team can define one **team harness** (a `harness.yaml`) committed to their
   repository, and every member compiles identical native config for whichever
   agent they use (Claude Code, Cursor, Copilot, Codex, …).
2. Drift from the committed harness is caught **in CI**, before it reaches a
   teammate's machine.
3. Onboarding a developer is `harness compile` — they are configured identically
   to the rest of the team in one step.

## Requirements (EARS — for the parts that are knowable today)

- **WHEN** a repository contains a committed `harness.yaml`, **THE SYSTEM SHALL**
  let any contributor run `harness compile` to produce the native config for
  their detected agent(s) without any per-user setup.
- **WHEN** `harness check` runs in CI against a committed `harness.yaml`,
  **THE SYSTEM SHALL** exit non-zero if the compiled output on the branch has
  drifted from the source, reporting which targets/keys differ. (Drift logic
  already exists in `packages/core/src/compile/check.ts`; the CLI entry point is
  `apps/cli/src/commands/check.ts`. The missing piece is a packaged GitHub Action
  / CI recipe wrapping it.)
- **WHEN** a team harness is compiled, **THE SYSTEM SHALL** be able to emit an
  `AGENTS.md` (the emerging cross-tool constitution standard) as a first-class
  target. (`AGENTS.md` is already referenced in `packages/core/src/compile/targets.ts`
  and `instructions.ts` — confirm coverage is complete.)
- **WHEN** a contributor's local compiled config drifts from the committed
  harness, **THE SYSTEM SHALL CONTINUE TO** leave their non-harness-managed
  config untouched (the compiler already scopes its writes to marker blocks).

## Open questions (resolve before planning)

- [NEEDS CLARIFICATION: Does "team" require a hosted backend (accounts, auth,
  shared workspaces), or is the v1 purely git-based — the team harness is just a
  file in the repo and there is no server at all? The git-only path is far
  cheaper and may cover most of the value.]
- [NEEDS CLARIFICATION: If a backend is needed, what is the identity model —
  bring-your-own (GitHub org), or Harness Kit accounts? What is hosted vs.
  self-hosted? Note the existing self-hosted relay precedent in `packages/chat-relay`.]
- [NEEDS CLARIFICATION: How are team-level secrets / env declarations handled —
  referenced by name only (committed) with values injected per-machine, never
  committed? (PII/secrets rules forbid committing values.)]
- [NEEDS CLARIFICATION: How does a team harness compose with a personal harness
  (precedence/override/extends)? `harness.yaml` already has an `extends` field —
  is team = base, personal = override?]
- [NEEDS CLARIFICATION: What is the desktop app's role for teams — read-only view
  of the team harness + drift status, or authoring/publishing? The current
  `harness/sync` page is a single-user stub.]

## Boundaries

- 🚫 **Never** commit secret/env *values* to a team harness — names/references only.
- ⚠️ **Ask first** before introducing any hosted backend, account system, or
  network dependency — that is a major architectural commitment and a separate
  decision.
- ✅ Reuse the existing drift logic (`packages/core/src/compile/check.ts`) and the
  `extends` mechanism rather than building new ones.

## Pointers

- Drift detection: `packages/core/src/compile/check.ts`
- CLI: `apps/cli/src/commands/check.ts` (`harness check`), `compile.ts`
- Compile targets incl. AGENTS.md: `packages/core/src/compile/targets.ts`
- Self-hosted service precedent: `packages/chat-relay`
