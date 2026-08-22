---
sidebar_position: 4
title: Harness Protocol
---

# Harness Protocol

The [Harness Protocol](https://harnessprotocol.ai) is an open specification for portable AI coding harness configuration. It defines a vendor-neutral `harness.yaml` format, validated by [JSON Schema](https://harnessprotocol.ai), that captures the complete operational context for an AI coding agent: plugins, skills, MCP servers, environment requirements, instructions, permissions, architectural constraints, and governance policy.

## How harness-kit relates to it

harness-kit is the **reference implementation** of the Harness Protocol. The relationship mirrors MCP and Claude Desktop: the protocol is the open specification, and harness-kit is the first tool that implements it.

Conformance does not require harness-kit. Any tool that correctly validates and applies `harness.yaml` according to the specification is a conformant implementation.

## Desktop App

The harness-kit desktop app treats `harness.yaml` as a first-class element. The **Harness File** page (the default landing page under the Harness section) reads `~/.claude/harness.yaml` or `~/harness.yaml` and displays a structured, annotated breakdown of each section — plugins, MCP servers, env declarations, instructions, permissions, and extends — with a raw YAML toggle.

## Architectural constraints

`architectural-constraints` declares the conventions a project expects an agent to
follow, at three enforcement levels:

```yaml
architectural-constraints:
  linters:
    - name: module-boundary
      description: No imports across layer boundaries.
      enforcement: block
  structural-tests:
    - name: layering
      description: The dependency graph stays acyclic.
      entrypoint: pnpm test:arch
  review-policy:
    guidance: Prefer boring, explicit code over clever abstractions.
    patterns:
      - name: no-queries-in-loops
        rule: Never issue a database query inside a loop; batch or join instead.
        severity: error
```

harness-kit compiles this into its own marker block in each platform's operational
instruction file — `CLAUDE.md`, `AGENTS.md`, `.cursor/rules/harness.mdc`,
`.github/copilot-instructions.md` — separate from anything you write under
`instructions.operational`, so the two never collide.

Review patterns are grouped by `severity` (`error` → *Must not violate*,
`warning` → *Should follow*, `info` → *Worth considering*), most severe first.
`linters` and `structural-tests` are rendered as awareness rather than
enforcement: harness-kit does not run them, but the agent is told what gates
exist, which ones block a merge, and — where a `structural-test` declares an
`entrypoint` — the command it can run itself instead of waiting for CI.

Setting `review-policy.enabled: false` suppresses the review patterns and
guidance while leaving the deterministic gates in place, since those run in CI
regardless of what the agent is told. `review-policy.model` is never written into
the instruction file: it configures whichever harness performs the review, and is
not guidance the agent should read as a rule.

`harness check` reports drift on the constraints block the same way it does for
instruction slots.

## Links

- [Harness Protocol spec](https://harnessprotocol.ai) — full specification, including architecture, field reference, security model, and plugin manifest format
- [JSON Schema](https://harnessprotocol.ai/schema/v1/harness.schema.json) — machine-readable validation schema
- [harness-kit](https://github.com/harnessprotocol/harness-kit) — reference implementation
