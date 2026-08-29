# Compliance Report: Whole-Harness Portability and Governance

## Result

**17 of 18 acceptance criteria pass. Implementation is review-ready but not GA-certified.** The remaining criterion is an external deployment gate: run the same registry contract runner against both the documented container stack and the managed service. The contract runner and stack configuration are present, but Docker Desktop is not running in this environment and no managed contract URL/token was supplied.

## Acceptance Criteria

- [x] **Whole-harness resource coverage.** Protocol v2 normalizes plugins, skills, MCP servers, instructions, environment declarations, permissions, architecture, policy, and inheritance. Native extensions capture agents, commands, hooks, workflows, models/settings, and unmatched native files in namespaced vendor blocks.
- [x] **Equal lifecycle across eight targets.** The exhaustive capability registry contains every resource, operation, and scope cell for Claude Code, Cursor, GitHub Copilot, Codex, OpenCode, Windsurf, Gemini, and Junie. The eight-target lifecycle test applies and recaptures normalized skills and instructions on every target.
- [x] **Layered precedence and policy ceiling.** Organization → personal → project → session resolution, nearest-wins behavior, flat-alias collisions, and organization ceiling violations are covered by core tests.
- [x] **Three-way reconciliation.** Reconciliation compares the last-applied base, current native peer, and resolved desired layers. Divergent edits remain blocked until an explicit per-conflict choice is supplied.
- [x] **Transactional preservation and rollback.** Apply verifies preimages, rejects unowned or user-modified files unless explicitly adopted, backs up all preimages, uses atomic renames, rejects symlink boundaries, and restores all mutated targets on failure.
- [x] **Native-only round-trip.** Originating-target vendor blocks round-trip through capture/apply; other targets receive source-only portability losses instead of fabricated native support. Credential-shaped settings are omitted.
- [x] **Stable resource identity and aliases.** Resource identity is `{kind, source/publisher, name}`; duplicate flat aliases create an explicit conflict and promotion requires `--replace` to select a winner.
- [x] **Pinned reference and capsule promotion.** Reference promotion requires a clean committed directory and exact commit revision. Capsule promotion validates a declared file set, dependencies, frontmatter, paths, symlinks, and digests before content-addressed storage.
- [x] **Immutable publication and mutable labels.** Artifact blobs are immutable and digest-addressed. Rollouts pin both artifact ID and digest when created, so administrators can repoint a semantic-version label without changing bytes available to pinned clients.
- [x] **Secret exclusion.** Capture sanitizes literal credentials, environment resources carry declarations rather than values, apply resolves local environment, and inventory redaction rejects credential-shaped or forbidden payloads both client- and server-side.
- [x] **Organization roles and workflows.** Device auth, organizations, memberships, submissions, artifacts, releases, policies, exceptions, rollouts, inventory, and audit APIs enforce member, publisher, and administrator roles.
- [x] **Publication security policy.** Whole profiles and capsules are scanned for structural failures, path escape, symlinks, digest mismatch, dangerous instructions, secret access, and executable content. Structural and credential failures cannot be bypassed; policy findings require an audited administrator exception.
- [x] **Governed updates.** Releases support channels; rollouts support validated rings, effective dates, pause/resume, offline/health reports, immutable assignment, and label mutation. `org rollout-sync` stages pinned bytes, defaults optional changes to preview, transactionally applies policy-mandated updates, verifies convergence, and restores the previous local transaction on failure.
- [ ] **Managed and self-hosted contract parity.** One containerized TypeScript service, migration set, Docker Compose stack, and portable contract runner are implemented. `docker compose config --quiet` passes and the in-memory HTTP contract passes. The required two external executions remain pending because Docker Desktop is not running and no managed endpoint/token is available.
- [x] **Redacted inventory.** Inventory includes assignments, versions/digests, targets, parsed native state, and drift while excluding raw files, skill bodies, prompts, secret values, and environment contents. Enrollment and organization policy authorize upload without a second payload-consent screen.
- [x] **CLI, desktop, and web surfaces.** CLI exposes capture/reconcile/apply/rollback, skill catalogs, organization auth/submission, and rollout sync. Desktop Fleet/Drift compute previews from the core engine and expose enrollment, capabilities, conflicts, rollout state, and rollback history. The web console uses the versioned registry API for roles, policy, findings, submissions, releases, rollout rings, inventory, drift, and audit.
- [x] **Backward compatibility.** v1 profiles continue through parse/compile/reconcile migration paths. Existing import, status, diff, and fix remain available; fix uses the shared transactional engine.
- [x] **Protocol v2 capture and non-destructive preview.** New captures produce v2. Capture, reconcile, apply, rollback, promotion, and optional rollout workflows preview by default; mutation requires explicit approval unless organization policy mandates the rollout.

## Verification Evidence

- `pnpm test:all` — 22/22 Turbo tasks passed, including 371 core tests, 64 CLI tests, 12 registry contract tests, 448 desktop tests, 4 admin console tests, and production builds.
- `pnpm test:desktop:rust` — 40 Rust tests passed.
- Documentation production build — 79 static pages generated successfully with the eight-target capability matrix.
- Portable contract runner type-check — the deployment runner covers device auth, membership, policy, immutable/private artifacts, submissions, releases, label mutation, rollout health, inventory, and audit.
- `pnpm audit --prod --audit-level high` — no known vulnerabilities.
- `docker compose -f packages/registry-service/docker-compose.yml config --quiet` — valid.
- Manual browser verification — authenticated web console, submissions, desktop-sized layouts, and 390×844 responsive behavior inspected.

## Pending GA Gate

Run `pnpm --filter @harness-kit/registry-service test:contract` once with the self-hosted container URL/token and once with the managed service URL/token. Record both results before the integration branch is merged to `main` or a GA release is created.
