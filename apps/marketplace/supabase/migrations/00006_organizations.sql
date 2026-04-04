-- Organizations (teams that can publish private plugins and manage members)
create table organizations (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Organization members (with role-based access control)
create table org_members (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- Indexes for common queries
create index idx_organizations_slug on organizations(slug);
create index idx_org_members_org_id on org_members(org_id);
create index idx_org_members_user_id on org_members(user_id);

-- Updated_at trigger
create trigger organizations_updated_at
  before update on organizations
  for each row execute function update_updated_at();

-- Organization components (private plugins scoped to an organization)
create table org_components (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  slug text unique not null check (slug ~ '^@[a-z0-9-]+/[a-z0-9-]+$'),
  name text not null,
  type text not null check (type in ('skill', 'agent', 'hook', 'script', 'knowledge', 'rules')),
  description text not null,
  version text not null,
  author jsonb not null default '{}',
  license text not null default 'Apache-2.0',
  skill_md text,
  readme_md text,
  repo_url text,
  install_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Join tables for org_components
create table org_component_categories (
  org_component_id uuid not null references org_components(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  primary key (org_component_id, category_id)
);

create table org_component_tags (
  org_component_id uuid not null references org_components(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (org_component_id, tag_id)
);

-- Full-text search index on org_components
alter table org_components add column fts tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(skill_md, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(readme_md, '')), 'D')
  ) stored;

create index idx_org_components_fts on org_components using gin(fts);

-- Indexes for common queries
create index idx_org_components_org_id on org_components(org_id);
create index idx_org_components_type on org_components(type);
create index idx_org_components_slug on org_components(slug);

-- Updated_at trigger
create trigger org_components_updated_at
  before update on org_components
  for each row execute function update_updated_at();

-- Plugin approvals (track which public plugins are approved/denied for org use)
create table org_plugin_approvals (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  component_id uuid not null references components(id) on delete cascade,
  status text not null check (status in ('approved', 'denied', 'pending')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, component_id)
);

-- Indexes for common queries
create index idx_org_plugin_approvals_org_id on org_plugin_approvals(org_id);
create index idx_org_plugin_approvals_component_id on org_plugin_approvals(component_id);
create index idx_org_plugin_approvals_status on org_plugin_approvals(status);

-- Updated_at trigger
create trigger org_plugin_approvals_updated_at
  before update on org_plugin_approvals
  for each row execute function update_updated_at();

-- Enable RLS on all organization tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_component_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_component_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_plugin_approvals ENABLE ROW LEVEL SECURITY;

-- Public read access (anon key can SELECT)
CREATE POLICY "Public read" ON organizations FOR SELECT USING (true);
CREATE POLICY "Public read" ON org_members FOR SELECT USING (true);
CREATE POLICY "Public read" ON org_components FOR SELECT USING (true);
CREATE POLICY "Public read" ON org_component_categories FOR SELECT USING (true);
CREATE POLICY "Public read" ON org_component_tags FOR SELECT USING (true);
CREATE POLICY "Public read" ON org_plugin_approvals FOR SELECT USING (true);

-- Writes restricted to service_role only (default when RLS is enabled with no
-- INSERT/UPDATE/DELETE policies for anon). The service_role key bypasses RLS,
-- so API routes continue to work without any additional policies.

-- Replace the existing increment_org_component_install_count function with a
-- SECURITY DEFINER version so it runs with the function owner's privileges
-- (bypasses RLS for the atomic update). Callable by anon, but scoped to a
-- single atomic operation.
CREATE OR REPLACE FUNCTION increment_org_component_install_count(component_slug text)
RETURNS int AS $$
DECLARE
  new_count int;
BEGIN
  UPDATE org_components
    SET install_count = install_count + 1
    WHERE slug = component_slug
    RETURNING install_count INTO new_count;
  RETURN new_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;
