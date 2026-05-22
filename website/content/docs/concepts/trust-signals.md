---
sidebar_position: 10
title: Trust Signals
---

# Trust Signals

Every plugin in the [marketplace](/marketplace) carries a **trust badge** and a
**security panel**. These are not self-reported — they are produced by scanning each
plugin's source at build time, so what you see on a plugin page reflects the code that
actually ships.

## How scanning works

When the marketplace data is generated, the harness-kit security scanner runs over every
plugin directory. It inspects the plugin manifest and every script and skill file
(`hooks/`, `scripts/`, `skills/`, `agents/`) for:

- **External URLs** — network destinations referenced in code or skills.
- **Environment variable access** — especially variables declared `sensitive`.
- **Filesystem access** — broad or sensitive write paths requested in the manifest.
- **Suspicious scripts** and **network access** patterns.

The scan produces a status, a permissions summary, and a list of findings. All of it is
baked into the static marketplace data — there is no server, database, or runtime call.

## What the badge means

| Badge | Scan status | Meaning |
|-------|-------------|---------|
| **Verified** | passed | No warning- or critical-level findings (informational notes may still appear). |
| **Caution** | warnings | One or more warning-level findings worth a glance — e.g. a detected external URL, network access, or a broad filesystem write path. |
| **Review** | failed | One or more critical findings — read the security panel before installing. |
| **Unscanned** | not scanned | No scan result available. |

A **Caution** badge is normal and expected for plugins that legitimately reach the network
or write files — for example, a plugin whose skill references an external URL. The badge
surfaces *what* a plugin can do so you can decide whether that matches what you expect it
to do.

Declaring a sensitive environment variable (such as a `GH_TOKEN`) is recorded as an
**informational** note, not a warning — on its own it does not lower a plugin below
**Verified**. It still appears in the permissions summary so you can see what the plugin
reads.

## The permissions summary

Each plugin page lists the capabilities the scan inferred:

- **Network access** — whether the plugin reaches the network.
- **File writes** — whether it requests write access, and to which paths.
- **Environment variables** — which variables it reads.
- **External URLs** — destinations it references.
- **Filesystem patterns** — paths declared in its manifest.

## Build-time enforcement

The data generator supports a `--strict` mode that fails the build if any first-party
plugin scans as **failed**. The documentation site runs the generator in strict mode, so
a plugin that introduces a critical finding cannot ship silently.

> Trust signals describe first-party plugins today. The same scan runs for any future
> source, so the badges stay meaningful as the catalog grows.
