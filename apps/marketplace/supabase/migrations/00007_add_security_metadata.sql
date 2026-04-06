-- Security scan status enum
create type security_scan_status as enum ('passed', 'warnings', 'failed', 'not_scanned');

-- Add security metadata columns to components table
alter table components
  add column security_scan_status security_scan_status not null default 'not_scanned',
  add column security_scan_date timestamptz,
  add column security_findings jsonb not null default '[]',
  add column security_permissions jsonb not null default '{"network_access":false,"file_writes":false,"env_var_reads":[],"external_urls":[],"filesystem_patterns":[]}';

-- Index for filtering by scan status (e.g. show only scanned plugins)
create index idx_components_security_scan_status on components(security_scan_status);
