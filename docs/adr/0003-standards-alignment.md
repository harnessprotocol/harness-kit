# harness.yaml compiles to and from the open standards

HarnessKit aligns with the three cross-tool standards as of August 2026: AGENTS.md as the shared instruction dialect, Agent Skills (`.agents/skills/`) as the skills format/location, and Agent Plugins 1.0.0 as the plugin interchange format (while continuing to support the Claude Code plugin/marketplace model, which Copilot also reads). harness.yaml's value sits above the standards — scope layers, permissions, policy ceilings, secrets handling, and governance that none of them cover. Chosen over staying proprietary because riding the standards keeps recommendations current by construction and turns "our format vs. theirs" into "our format governs theirs."

## Consequences

- Recommendations and adapters must track standards evolution (Agent Plugins is 3 weeks old; Anthropic is not a maintainer), which ADR 0004's remote definitions absorb.

Decided 2026-08-31 during the cross-harness config management design session.
