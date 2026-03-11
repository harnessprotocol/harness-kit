---
sidebar_position: 4
title: Harness Protocol
---

# Harness Protocol

The [Harness Protocol](https://github.com/harnessprotocol/harness-protocol) is an open specification for portable AI coding harness configuration. It defines a vendor-neutral `harness.yaml` format, validated by [JSON Schema](https://github.com/harnessprotocol/harness-protocol/blob/main/schema/draft/harness.schema.json), that captures the complete operational context for an AI coding agent: plugins, MCP servers, environment requirements, instructions, and permissions.

## How harness-kit relates to it

harness-kit is the **reference implementation** of the Harness Protocol. The relationship mirrors MCP and Claude Desktop: the protocol is the open specification, and harness-kit is the first tool that implements it.

Conformance does not require harness-kit. Any tool that correctly validates and applies `harness.yaml` according to the specification is a conformant implementation.

## Links

- [Harness Protocol spec](https://github.com/harnessprotocol/harness-protocol) — full specification, including architecture, field reference, security model, and plugin manifest format
- [JSON Schema](https://github.com/harnessprotocol/harness-protocol/blob/main/schema/draft/harness.schema.json) — machine-readable validation schema
- [harness-kit](https://github.com/harnessprotocol/harness-kit) — reference implementation
