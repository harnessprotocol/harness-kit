---
sidebar_position: 2
title: Quick Start
---

# Quick Start

Install a plugin and try it in under a minute.

## 1. Add the marketplace

```
/plugin marketplace add harnessprotocol/harness-kit
```

## 2. Install a plugin

Start with `explain` — it works in any codebase with no setup:

```
/plugin install explain@harness-kit
```

## 3. Use it

Point it at any file in your project:

```
/explain src/index.ts
```

You'll get a structured breakdown: summary, key components, how it connects, patterns, gotchas, and entry points for change.

## Try more plugins

### Research a topic

```
/plugin install research@harness-kit
/research https://github.com/anthropics/claude-code
```

Fetches the repo, saves raw content, and creates a synthesis document.

### Trace data lineage

```
/plugin install data-lineage@harness-kit
/data-lineage orders.total_amount
```

Traces a column through SQL, Kafka, Spark, and JDBC code. Generates an SVG diagram.

### Orient on a topic

```
/plugin install orient@harness-kit
/orient authentication
```

Searches your knowledge graph, docs, and journal for everything related to a topic.

### Capture session facts

```
/plugin install capture-session@harness-kit
/capture-session SQLite chosen over Postgres for local-first storage
```

Stages important decisions and facts for later reflection.

## What's next

- Browse all [plugins](/docs/plugins/overview)
- Learn [how plugins work](/docs/concepts/plugins-vs-skills)
- [Create your own plugin](/docs/guides/creating-plugins)
