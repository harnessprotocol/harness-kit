---
sidebar_position: 4
title: Harness Protocol
---

# Harness Protocol

The [Harness Protocol](https://harnessprotocol.io) is an open specification for portable AI coding harness configuration. It defines a vendor-neutral `harness.yaml` format, validated by [JSON Schema](https://harnessprotocol.io), that captures the complete operational context for an AI coding agent: plugins, MCP servers, environment requirements, instructions, and permissions.

## How harness-kit relates to it

harness-kit is the **reference implementation** of the Harness Protocol. The relationship mirrors MCP and Claude Desktop: the protocol is the open specification, and harness-kit is the first tool that implements it.

Conformance does not require harness-kit. Any tool that correctly validates and applies `harness.yaml` according to the specification is a conformant implementation.

## Desktop App

The harness-kit desktop app treats `harness.yaml` as a first-class element. The **Harness File** page (the default landing page under the Harness section) reads `~/.claude/harness.yaml` or `~/harness.yaml` and displays a structured, annotated breakdown of each section — plugins, MCP servers, env declarations, instructions, permissions, and extends — with a raw YAML toggle.

## Links

- [Harness Protocol spec](https://harnessprotocol.io) — full specification, including architecture, field reference, security model, and plugin manifest format
- [JSON Schema](https://harnessprotocol.ai/schema/v1/harness.schema.json) — machine-readable validation schema
- [harness-kit](https://github.com/harnessprotocol/harness-kit) — reference implementation
