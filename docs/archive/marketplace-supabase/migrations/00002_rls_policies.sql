-- Enable RLS on all tables
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE components ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE component_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE component_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_tags ENABLE ROW LEVEL SECURITY;

-- Public read access (anon key can SELECT)
CREATE POLICY "Public read" ON categories FOR SELECT USING (true);
CREATE POLICY "Public read" ON tags FOR SELECT USING (true);
CREATE POLICY "Public read" ON components FOR SELECT USING (true);
CREATE POLICY "Public read" ON profiles FOR SELECT USING (true);
CREATE POLICY "Public read" ON component_categories FOR SELECT USING (true);
CREATE POLICY "Public read" ON component_tags FOR SELECT USING (true);
CREATE POLICY "Public read" ON profile_components FOR SELECT USING (true);
CREATE POLICY "Public read" ON profile_categories FOR SELECT USING (true);
CREATE POLICY "Public read" ON profile_tags FOR SELECT USING (true);

-- Writes restricted to service_role only (default when RLS is enabled with no
-- INSERT/UPDATE/DELETE policies for anon). The service_role key bypasses RLS,
-- so API routes (/api/sync, /api/register, /api/install) and the seed script
-- continue to work without any additional policies.

-- Replace the existing increment_install_count function with a SECURITY DEFINER
-- version so it runs with the function owner's privileges (bypasses RLS for the
-- atomic update). Callable by anon, but scoped to a single atomic operation.
CREATE OR REPLACE FUNCTION increment_install_count(component_slug text)
RETURNS int AS $$
DECLARE
  new_count int;
BEGIN
  UPDATE components
    SET install_count = install_count + 1
    WHERE slug = component_slug
    RETURNING install_count INTO new_count;
  RETURN new_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;
