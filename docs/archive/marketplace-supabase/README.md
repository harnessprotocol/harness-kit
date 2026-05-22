# Archived: Supabase marketplace backend

This directory preserves the schema and design of the original Supabase-backed
marketplace app (`apps/marketplace/`), which was **removed** when the marketplace was
rebuilt as a static, git-sourced browser inside the documentation site (`website/`).

## Why it was removed

The Supabase app was never deployed and had no users. For a project with 16 first-party
plugins and no community contributions, a build-time static marketplace generated from git
(`.claude-plugin/marketplace.json` + each `plugin.json` + `SKILL.md`) is simpler, always in
sync, requires no infrastructure, and unifies the marketplace under one design system and one
deploy. See `packages/marketplace-data/` for the generator and `website/app/marketplace/` for
the browser.

## Why it was kept

This schema is the seed of the **future** community/team self-service model — the part a
static site genuinely cannot provide. When real demand for self-service publishing exists,
this is the starting point rather than a blank page. The browse UI was deliberately built
around a `MarketplaceSource` abstraction (`website/lib/marketplace/data.ts`) so a future
dynamic source can merge into the same UI without a rewrite.

## What's here

- `migrations/` — the 7 Postgres migrations capturing the full data model:
  components, categories, tags, full-text search, ratings, reviews, review flags,
  organizations, org members, org-private components, plugin approvals, and the
  security-metadata columns.
- `seed.ts` — seed data loader.
- `LOCAL_SETUP.md` — original local Supabase setup notes.

These are reference artifacts, not running code. The full original app (API routes, auth,
React UI) remains recoverable from git history prior to its removal.
