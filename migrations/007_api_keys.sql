-- Workspace API keys for integrations (Zapier, Make, scripts). Only a SHA-256 hash of the key is
-- stored; the key itself is shown once when it is created.
--
-- Each key acts as a hidden member of its workspace (workspace_members.user_id = 'apikey_<id>') with
-- the role its scopes allow, so every existing permission, credit and approval rule applies to it.
-- Revoking a key deletes that member row.
CREATE TABLE api_keys (
  id text PRIMARY KEY CHECK (id ~ '^[0-9a-f-]{36}$'),
  workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  -- First characters of the key, shown so people can tell keys apart (not enough to use it).
  prefix text NOT NULL CHECK (char_length(prefix) <= 20),
  key_hash text NOT NULL UNIQUE CHECK (char_length(key_hash) = 64),
  scopes text[] NOT NULL CHECK (scopes <@ ARRAY['read', 'write', 'publish']::text[] AND cardinality(scopes) > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX api_keys_ws_idx ON api_keys (workspace_id, created_at DESC);
