-- Revoke direct RPC access to increment_install_count from unprivileged roles.
-- The /api/install route uses service_role which bypasses grants and continues
-- to work. Direct calls via the anon or authenticated key (e.g., from the
-- Supabase client SDK) are now blocked, preventing install-count manipulation.
REVOKE EXECUTE ON FUNCTION increment_install_count(text) FROM anon;
REVOKE EXECUTE ON FUNCTION increment_install_count(text) FROM authenticated;
