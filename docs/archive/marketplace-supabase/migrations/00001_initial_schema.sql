-- Enable extensions
create extension if not exists "uuid-ossp";

-- Categories (curated, small list)
create table categories (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  name text not null,
  display_order int not null default 0
);

-- Tags (freeform, auto-populated)
create table tags (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null
);

-- Components (the atomic distributable unit)
create table components (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  name text not null,
  type text not null check (type in ('skill', 'agent', 'hook', 'script', 'knowledge', 'rules')),
  description text not null,
  trust_tier text not null default 'community' check (trust_tier in ('official', 'verified', 'community')),
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

-- Profiles (named harness.yaml templates)
create table profiles (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  name text not null,
  description text not null,
  author jsonb not null default '{}',
  trust_tier text not null default 'community' check (trust_tier in ('official', 'verified', 'community')),
  harness_yaml_template text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Join tables
create table component_categories (
  component_id uuid not null references components(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  primary key (component_id, category_id)
);

create table component_tags (
  component_id uuid not null references components(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (component_id, tag_id)
);

create table profile_components (
  profile_id uuid not null references profiles(id) on delete cascade,
  component_id uuid not null references components(id) on delete cascade,
  pinned_version text not null,
  primary key (profile_id, component_id)
);

create table profile_categories (
  profile_id uuid not null references profiles(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  primary key (profile_id, category_id)
);

create table profile_tags (
  profile_id uuid not null references profiles(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (profile_id, tag_id)
);

-- Full-text search index on components
alter table components add column fts tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(skill_md, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(readme_md, '')), 'D')
  ) stored;

create index idx_components_fts on components using gin(fts);

-- Full-text search index on profiles
alter table profiles add column fts tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) stored;

create index idx_profiles_fts on profiles using gin(fts);

-- Index for common queries
create index idx_components_type on components(type);
create index idx_components_trust_tier on components(trust_tier);
create index idx_components_slug on components(slug);
create index idx_profiles_slug on profiles(slug);

-- Updated_at trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger components_updated_at
  before update on components
  for each row execute function update_updated_at();

create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

-- Atomic install count increment (avoids read-then-write race condition)
create or replace function increment_install_count(component_slug text)
returns int as $$
declare
  new_count int;
begin
  update components
    set install_count = install_count + 1
    where slug = component_slug
    returning install_count into new_count;
  return new_count;
end;
$$ language plpgsql;
