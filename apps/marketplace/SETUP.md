# Marketplace — Local Development Setup

## Environment variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp apps/marketplace/.env.example apps/marketplace/.env.local
```

Required variables:

| Variable | Where to get it |
|----------|----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project dashboard → Settings → API (server-only, never expose publicly) |
| `SUPABASE_URL` | Same as `NEXT_PUBLIC_SUPABASE_URL` — used in seed scripts and server-side operations |
| `REGISTER_API_KEY` | Choose any secret string — protects the `/api/register` endpoint |
| `GITHUB_TOKEN` | GitHub PAT with repo read access (optional — for syncing private repo content) |
| `GITHUB_WEBHOOK_SECRET` | Match the secret set in your GitHub webhook config |

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
