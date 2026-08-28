CREATE TABLE IF NOT EXISTS registry_records (
  kind text NOT NULL,
  id text NOT NULL,
  organization_id text,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (kind, id)
);

CREATE INDEX IF NOT EXISTS registry_records_org_kind_idx
  ON registry_records (organization_id, kind, created_at);

CREATE INDEX IF NOT EXISTS registry_records_payload_gin_idx
  ON registry_records USING gin (payload);
