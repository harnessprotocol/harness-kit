# Local Supabase Setup

This document explains how to set up Supabase CLI for local development and migration testing.

## Prerequisites

- Docker Desktop (for running Supabase locally)
- Supabase CLI

## Install Supabase CLI

### macOS
```bash
brew install supabase/tap/supabase
```

### Linux
```bash
brew install supabase/tap/supabase
# or
npm install -g supabase
```

### Windows
```powershell
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

## Initialize Local Supabase

From the `apps/marketplace` directory:

```bash
cd apps/marketplace
supabase init
```

This creates a `supabase/config.toml` file with local development settings.

## Start Local Supabase

```bash
supabase start
```

This starts:
- PostgreSQL database (port 54322)
- Kong API Gateway (port 54321)
- GoTrue Auth (port 9999)
- Inbucket Mail (port 54324)
- Supabase Studio (port 54323)

## Apply Migrations

```bash
# Apply all migrations
supabase migration up

# Apply a specific migration
supabase migration up --target 00006

# Check migration status
supabase migration list
```

## Run Migrations Against Cloud Instance

If you prefer to test against a cloud Supabase instance:

1. Get your connection string from Supabase dashboard
2. Link your local project:
   ```bash
   supabase link --project-ref <your-project-ref>
   ```
3. Apply migrations:
   ```bash
   supabase db push
   ```

## Verify Migration Applied

After running migrations, verify the schema:

```bash
# Connect to local database
psql postgresql://postgres:postgres@localhost:54322/postgres

# Or use Supabase Studio
open http://localhost:54323
```

Run the verification queries from `00006_organizations_validation_report.md`.

## Stop Local Supabase

```bash
supabase stop
```

## Reset Local Database

To start fresh:

```bash
supabase db reset
```

This drops all tables and re-runs all migrations from scratch.

## Troubleshooting

### Port Already in Use
If ports are already in use, check for running Docker containers:
```bash
docker ps
docker stop <container-id>
```

### Migration Failed
Check logs:
```bash
supabase logs
```

Or connect to the database and check manually:
```bash
psql postgresql://postgres:postgres@localhost:54322/postgres
```

### Docker Not Running
Ensure Docker Desktop is running before starting Supabase.

## Resources

- [Supabase CLI Docs](https://supabase.com/docs/guides/cli)
- [Local Development Guide](https://supabase.com/docs/guides/cli/local-development)
- [Migration Guide](https://supabase.com/docs/guides/cli/local-development#database-migrations)
