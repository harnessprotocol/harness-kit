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

## Configure GitHub OAuth

To enable user authentication for ratings and reviews, configure GitHub as an OAuth provider in Supabase:

1. **Create a GitHub OAuth App:**
   - Go to GitHub Settings → Developer settings → OAuth Apps → New OAuth App
   - **Application name:** Harness Kit Marketplace (or your app name)
   - **Homepage URL:** `http://localhost:3001` (or your production URL)
   - **Authorization callback URL:** `https://<project-ref>.supabase.co/auth/v1/callback`
   - Save the app and note the **Client ID** and **Client Secret**

2. **Configure Supabase Auth:**
   - In your Supabase dashboard, go to **Authentication → Providers**
   - Enable the **GitHub** provider
   - Enter your GitHub OAuth **Client ID** and **Client Secret**
   - Save changes

3. **Update Site URL (Production only):**
   - In Supabase dashboard, go to **Authentication → URL Configuration**
   - Set **Site URL** to your production domain (e.g., `https://marketplace.harness.com`)
   - Add your production domain to **Redirect URLs**

For local development, the default callback URL configuration will work. For production, update the GitHub OAuth app's callback URL and Supabase site URL to match your production domain.

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
