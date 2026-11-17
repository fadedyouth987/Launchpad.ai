-- Direct social publishing. One connected account per network per workspace; the OAuth access token
-- is encrypted by the API (AES-256-GCM, AI_KEYS_ENCRYPTION_KEY) and never returned to clients.
CREATE TABLE social_accounts (
  id text PRIMARY KEY CHECK (id ~ '^soc-[A-Za-z0-9_-]{1,100}$'),
  workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('linkedin')),
  -- The network's id for the account (LinkedIn: the member id from OpenID Connect "sub").
  external_id text NOT NULL CHECK (char_length(external_id) <= 200),
  display_name text NOT NULL DEFAULT '' CHECK (char_length(display_name) <= 200),
  avatar_url text NOT NULL DEFAULT '' CHECK (char_length(avatar_url) <= 2048),
  token_ciphertext text NOT NULL CHECK (token_ciphertext LIKE 'v1.%'),
  token_expires_at timestamptz,
  connected_by text NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider)
);

-- One row per (asset, account): the UNIQUE constraint is what stops a post going out twice, even if
-- the scheduler and "Publish now" race or a run is retried.
CREATE TABLE social_posts (
  id text PRIMARY KEY CHECK (id ~ '^post-[A-Za-z0-9_-]{1,100}$'),
  workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  asset_id text NOT NULL,
  provider text NOT NULL,
  account_external_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('publishing', 'published', 'failed')),
  external_post_id text,
  external_url text,
  error text CHECK (char_length(error) <= 1000),
  attempts integer NOT NULL DEFAULT 1,
  requested_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, provider, account_external_id)
);
CREATE INDEX social_posts_ws_time_idx ON social_posts (workspace_id, updated_at DESC);
