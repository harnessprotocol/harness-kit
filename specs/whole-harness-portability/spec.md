# Whole-Harness Portability and Governance

Harness Kit captures, reconciles, governs, and safely ports a developer's complete AI coding harness configuration across supported tools without making any one configuration file the exclusive source of truth.

## Problem Statement

AI coding harness configuration is fragmented across tool-specific project and user directories. Skills, plugins, instructions, agents, hooks, MCP servers, permissions, and settings created in one repository or tool are often unavailable elsewhere, difficult to share safely, and easy to drift. Teams lack a governed way to publish reusable capabilities, layer organization policy with personal and project preferences, see effective configuration across devices, and roll back failed changes.

Harness Kit must provide one portable reconciliation workflow for individuals and organizations while preserving native tool behavior, user-owned changes, provenance, and recoverability.

## User Stories

- As a developer, I can capture my current harness configuration and apply it to another supported harness without silently losing native-only behavior.
- As a developer, I can promote a repository-local skill or other reusable resource into a personal or organization catalog and use it outside the source repository.
- As a developer, I can understand and resolve conflicts between organization, personal, project, session, and native tool state before any files change.
- As a team member, I can submit reusable harness resources to my organization.
- As a publisher, I can publish organization resources that pass automated policy and security checks.
- As an administrator, I can govern allowed sources, releases, rollout channels, devices, and exceptions while retaining a complete audit and rollback history.
- As a self-hosting organization, I can run the same registry behavior and API contract as the managed service.

## Acceptance Criteria

- [x] Harness Kit captures and reconciles plugins, skills, MCP servers, instructions, environment declarations, permissions, architectural constraints, policy, inheritance, and supported native extensions.
- [x] Claude Code, Cursor, GitHub Copilot, Codex, OpenCode, Windsurf, Gemini, and Junie expose the same capture, preview, reconciliation, apply, drift, and rollback lifecycle, with unsupported behavior reported explicitly.
- [x] Organization, personal, project, and session layers resolve deterministically, with the closest layer winning unless organization policy prohibits the result.
- [x] Reconciliation uses the previous applied state, current native state, and desired layered state; divergent changes require explicit resolution instead of last-writer-wins behavior.
- [x] Applying a change preserves unowned or independently modified content, creates recoverable backups, and restores the previous complete state when a multi-file or multi-target operation fails.
- [x] Native-only configuration round-trips to its originating tool and produces an actionable portability report when another tool cannot represent it.
- [x] Resource identity includes its kind, source or publisher, and name; ambiguous flat deployment aliases require an explicit selection.
- [x] Direct repository references and packaged catalog artifacts are both integrity-pinned and supported as first-class promotion sources.
- [x] Published content is addressable by immutable digest. Administrators may repoint a version label without making any previous digest unavailable.
- [x] Credentials and secret values are never captured. Only declarations and approved provider references are portable.
- [x] Organization members can submit resources, publishers can release them, and administrators can manage policy, roles, exceptions, mutations, and staged rollouts.
- [x] Blocking security-policy findings prevent publication unless an administrator records an auditable exception.
- [x] Organization updates can use channels, rollout rings, effective dates, pause controls, and automatic last-known-good restoration.
- [ ] The managed and self-hosted registry editions pass the same public API contract suite.
- [x] Organization inventory contains only client-redacted parsed configuration and operational metadata; it excludes raw files, skill bodies, prompts, secret values, and environment contents.
- [x] CLI, desktop, and web administration surfaces expose the same underlying lifecycle, provenance, capability, conflict, rollout, and rollback state.
- [x] Existing Harness Protocol v1 profiles and existing `import`, `status`, `diff`, and `fix` workflows continue to work.
- [x] New captures use Harness Protocol v2 and can be previewed without mutating native or portable configuration.

## Out of Scope

- Remotely executing commands on developer machines.
- Storing or distributing secret values.
- Compatibility adapters or runtime dependencies for other configuration-management products.
- Pretending unsupported native capabilities have portable semantics.
- Releasing a partial personal-only, organization-only, tool-subset, managed-only, or self-hosted-only edition as generally available.

## Open Questions

None. Product scope and tradeoffs were approved before implementation.

## Dependencies

- Existing Harness Protocol parsing, validation, compilation, import, drift, and adapter packages.
- GitHub identity for hosted and device authorization flows.
- PostgreSQL-compatible metadata storage and S3-compatible artifact storage for managed and self-hosted registries.
- Existing desktop Fleet and Drift surfaces.
