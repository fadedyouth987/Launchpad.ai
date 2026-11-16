-- Multi-provider AI: per-workspace provider/model choice, workspace-supplied API keys (encrypted by
-- the API with AES-256-GCM; the database never sees a plaintext key), and generated images.

CREATE TABLE workspace_ai_settings (
  workspace_id text PRIMARY KEY REFERENCES workspaces (id) ON DELETE CASCADE,
  -- NULL = use the server default provider.
  text_provider text CHECK (text_provider IN ('neon-gateway', 'anthropic', 'openai', 'gemini', 'xai', 'custom')),
  text_model text CHECK (char_length(text_model) <= 200),
  image_provider text CHECK (image_provider IN ('openai', 'gemini', 'xai')),
  image_model text CHECK (char_length(image_model) <= 200),
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspace_ai_keys (
  workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('anthropic', 'openai', 'gemini', 'xai')),
  key_ciphertext text NOT NULL CHECK (key_ciphertext LIKE 'v1.%'),
  key_last4 text NOT NULL CHECK (char_length(key_last4) <= 4),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, provider)
);

CREATE TABLE generated_images (
  id text PRIMARY KEY CHECK (id ~ '^img-[A-Za-z0-9_-]{1,100}$'),
  workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id text NOT NULL,
  prompt text NOT NULL CHECK (char_length(prompt) <= 2000),
  provider text NOT NULL,
  model text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  data bytea NOT NULL CHECK (octet_length(data) <= 8388608),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX generated_images_ws_time_idx ON generated_images (workspace_id, created_at DESC);
