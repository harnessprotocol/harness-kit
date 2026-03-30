-- NOTE: ratings table is reserved for standalone star ratings (without accompanying review text).
-- Currently the API populates this table alongside the reviews table on each review submission,
-- but the UI reads all averages and distributions directly from the reviews table. This table
-- has no current UI consumers and is kept as infrastructure for a future "quick rating" feature.
-- Ratings (quick star ratings per component)
create table ratings (
  id uuid primary key default uuid_generate_v4(),
  component_id uuid not null references components(id) on delete cascade,
  user_id text not null,
  rating int not null check (rating >= 1 and rating <= 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (component_id, user_id)
);

-- Reviews (full text reviews with rating)
create table reviews (
  id uuid primary key default uuid_generate_v4(),
  component_id uuid not null references components(id) on delete cascade,
  user_id text not null,
  user_name text not null,
  rating int not null check (rating >= 1 and rating <= 5),
  title text not null,
  content text not null,
  helpful_count int not null default 0,
  flagged boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Review flags (for reporting inappropriate reviews)
create table review_flags (
  id uuid primary key default uuid_generate_v4(),
  review_id uuid not null references reviews(id) on delete cascade,
  user_id text not null,
  reason text not null check (reason in ('spam', 'offensive', 'misleading', 'other')),
  created_at timestamptz not null default now(),
  unique (review_id, user_id)
);

-- Indexes for common queries
create index idx_ratings_component_id on ratings(component_id);
create index idx_ratings_user_id on ratings(user_id);
create index idx_reviews_component_id on reviews(component_id);
create index idx_reviews_user_id on reviews(user_id);
create index idx_reviews_flagged on reviews(flagged);
create index idx_review_flags_review_id on review_flags(review_id);

-- Updated_at triggers
create trigger ratings_updated_at
  before update on ratings
  for each row execute function update_updated_at();

create trigger reviews_updated_at
  before update on reviews
  for each row execute function update_updated_at();

-- Calculate average rating for a component
create or replace function get_component_rating(component_slug text)
returns jsonb as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'average', coalesce(round(avg(r.rating)::numeric, 1), 0),
    'count', count(r.id),
    'distribution', jsonb_build_object(
      '5', count(*) filter (where r.rating = 5),
      '4', count(*) filter (where r.rating = 4),
      '3', count(*) filter (where r.rating = 3),
      '2', count(*) filter (where r.rating = 2),
      '1', count(*) filter (where r.rating = 1)
    )
  ) into result
  from ratings r
  join components c on c.id = r.component_id
  where c.slug = component_slug;

  return coalesce(result, jsonb_build_object(
    'average', 0,
    'count', 0,
    'distribution', jsonb_build_object('5', 0, '4', 0, '3', 0, '2', 0, '1', 0)
  ));
end;
$$ language plpgsql security definer
   set search_path = public, pg_temp;

-- NOTE: increment_helpful_count is reserved for a future "mark as helpful" feature.
-- There are currently no API routes or UI callers for this function.
-- Atomic helpful count increment
create or replace function increment_helpful_count(review_uuid uuid)
returns int as $$
declare
  new_count int;
begin
  update reviews
    set helpful_count = helpful_count + 1
    where id = review_uuid
    returning helpful_count into new_count;
  return new_count;
end;
$$ language plpgsql security definer
   set search_path = public, pg_temp;

-- Enable RLS on all tables
alter table ratings enable row level security;
alter table reviews enable row level security;
alter table review_flags enable row level security;

-- Public read access (anon key can SELECT)
create policy "Public read" on ratings for select using (true);
create policy "Public read" on reviews for select using (true);
-- review_flags intentionally not readable by anon — exposes flaggers and moderation patterns
-- Reads are service_role only (bypasses RLS); no SELECT policy for anon/authenticated roles

-- Writes restricted to service_role only (default when RLS is enabled with no
-- INSERT/UPDATE/DELETE policies for anon). The service_role key bypasses RLS,
-- so API routes can handle write operations with proper validation.
