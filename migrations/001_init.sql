-- Launchpad schema (replaces the Firestore collections). Users live in Neon Auth (neon_auth."user");
-- user ids here are Neon Auth user ids (text). The browser never connects to Postgres: every read and
-- write goes through the API, which enforces membership and roles.

CREATE TABLE workspaces (
  id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{1,128}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  slug text NOT NULL CHECK (char_length(slug) BETWEEN 1 AND 50),
  owner_id text NOT NULL,
  plan text NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'professional', 'enterprise')),
  -- A negative balance is impossible even if application code were wrong.
  credits_remaining bigint NOT NULL DEFAULT 0 CHECK (credits_remaining >= 0),
  total_credits_allocated bigint NOT NULL DEFAULT 0 CHECK (total_credits_allocated >= 0),
  legal_hold_active boolean NOT NULL DEFAULT false,
  retention_days integer NOT NULL DEFAULT 365 CHECK (retention_days BETWEEN 1 AND 3650),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workspaces_owner_idx ON workspaces (owner_id);

CREATE TABLE workspace_members (
  workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'approver', 'creator', 'viewer')),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX workspace_members_user_idx ON workspace_members (user_id);

CREATE TABLE ledger_entries (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces (id),
  user_id text NOT NULL,
  type text NOT NULL CHECK (type IN ('reservation', 'deduction', 'refund', 'purchase', 'topup', 'grant')),
  description text NOT NULL DEFAULT '',
  amount_credits bigint NOT NULL,
  resulting_balance bigint NOT NULL CHECK (resulting_balance >= 0),
  asset_id text,
  -- Set on refunds only. UNIQUE: a reservation can be refunded at most once.
  reservation_id text UNIQUE REFERENCES ledger_entries (id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((type = 'refund') = (reservation_id IS NOT NULL))
);
CREATE INDEX ledger_entries_ws_time_idx ON ledger_entries (workspace_id, created_at DESC);

CREATE TABLE audit_logs (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces (id),
  user_id text NOT NULL,
  actor text NOT NULL,
  action text NOT NULL,
  details text NOT NULL DEFAULT '',
  ip_address text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  source text NOT NULL DEFAULT 'server' CHECK (source IN ('server', 'client')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX audit_logs_ws_time_idx ON audit_logs (workspace_id, created_at DESC);

CREATE TABLE influencers (
  id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{1,128}$'),
  workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL
);
CREATE INDEX influencers_ws_idx ON influencers (workspace_id);

CREATE TABLE campaign_os_states (
  workspace_id text PRIMARY KEY REFERENCES workspaces (id) ON DELETE CASCADE,
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL
);

CREATE TABLE campaign_assets (
  id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{1,128}$'),
  workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaign_assets_ws_idx ON campaign_assets (workspace_id, created_at DESC);

CREATE TABLE webhook_endpoints (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  url text NOT NULL,
  description text NOT NULL DEFAULT '',
  secret_preview text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'failing')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webhook_endpoints_ws_idx ON webhook_endpoints (workspace_id);

-- Signing secrets kept apart from endpoint metadata; never returned after creation.
CREATE TABLE webhook_secrets (
  endpoint_id text PRIMARY KEY REFERENCES webhook_endpoints (id) ON DELETE CASCADE,
  secret text NOT NULL
);
