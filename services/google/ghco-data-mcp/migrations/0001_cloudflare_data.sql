CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  schema_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_records_collection_updated
  ON records(collection_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS catalog_sources (
  id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  target_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT '',
  refresh_frequency TEXT NOT NULL DEFAULT 'manual',
  contains_personal_data INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
