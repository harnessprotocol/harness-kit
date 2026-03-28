# Marketplace — Local Development Setup

## Environment variables

Create `apps/marketplace/.env.local` with the following values:

```
# Supabase project URL (from Project Settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co

# Supabase anon key — safe to expose in the browser
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>

# Supabase service role key — server-only, never expose publicly
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# GitHub personal access token — used by the sync route to read private repo contents (optional)
GITHUB_TOKEN=<github-pat>

# GitHub webhook secret — must match the secret set in the GitHub webhook config
GITHUB_WEBHOOK_SECRET=<webhook-secret>
```

All values are available in your Supabase project dashboard under **Settings → API**.

## Seed the database

Run the seed script once to populate categories, tags, and all 16 plugins from the local catalog:

```bash
cd apps/marketplace
SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
npx tsx supabase/seed.ts
```

The seed script reads `.claude-plugin/marketplace.json` and the local `plugins/` directory for SKILL.md and README.md content. It is safe to re-run — all upserts are idempotent.

## Run the dev server

```bash
# From repo root
pnpm --filter harness-kit-marketplace dev

# Or from apps/marketplace directly
cd apps/marketplace && pnpm dev
```

The app starts on `http://localhost:3001`.

## Sync the catalog via the API route

The `/api/sync` route is a GitHub webhook handler. For local testing, you can skip webhook verification by triggering it manually with a mock payload — or just use the seed script above, which does the same job from local files.

To wire up the live webhook for production: configure a GitHub webhook on the `harnessprotocol/harness-kit` repo pointing to `https://<your-domain>/api/sync` with content type `application/json` and the secret matching `GITHUB_WEBHOOK_SECRET`.

## Type checking

```bash
cd apps/marketplace && pnpm typecheck
```

Note: `packages/shared` must be built before type checking works (`pnpm --filter @harness-kit/shared build`).
