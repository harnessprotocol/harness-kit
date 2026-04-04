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
  user_id text not null,
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
