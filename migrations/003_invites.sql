-- Team invitations. Only a SHA-256 hash of the invite token is stored; the link is shown once to the
-- inviter (and emailed when an email provider is configured).
CREATE TABLE workspace_invites (
  id text PRIMARY KEY CHECK (id ~ '^inv-[A-Za-z0-9_-]{1,100}$'),
  workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 320 AND email = lower(email)),
  role text NOT NULL CHECK (role IN ('admin', 'approver', 'creator', 'viewer')),
  token_hash text NOT NULL UNIQUE,
  invited_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_by text,
  accepted_at timestamptz
);
CREATE INDEX workspace_invites_ws_idx ON workspace_invites (workspace_id, created_at DESC);
