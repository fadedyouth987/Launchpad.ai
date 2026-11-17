-- AI voice (ElevenLabs) and talking-head video (D-ID). Files are stored here like generated images; a
-- video row starts as 'processing' while D-ID renders and becomes 'ready' once the file is downloaded.
CREATE TABLE generated_media (
  id text PRIMARY KEY CHECK (id ~ '^med-[A-Za-z0-9_-]{1,100}$'),
  workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('audio', 'video', 'image')),
  status text NOT NULL CHECK (status IN ('processing', 'ready', 'failed')),
  influencer_id text CHECK (char_length(influencer_id) <= 128),
  script text NOT NULL DEFAULT '' CHECK (char_length(script) <= 5000),
  voice_id text CHECK (char_length(voice_id) <= 100),
  provider text NOT NULL,
  provider_job_id text CHECK (char_length(provider_job_id) <= 200),
  -- The audio row a video was made from.
  source_media_id text REFERENCES generated_media (id) ON DELETE SET NULL,
  mime_type text CHECK (mime_type IN ('audio/mpeg', 'video/mp4', 'image/png', 'image/jpeg', 'image/webp')),
  data bytea CHECK (octet_length(data) <= 52428800),
  error text CHECK (char_length(error) <= 1000),
  cost_credits integer NOT NULL DEFAULT 0,
  -- Credit reservation to refund if the render fails.
  reservation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'ready') = (data IS NOT NULL))
);
CREATE INDEX generated_media_ws_time_idx ON generated_media (workspace_id, created_at DESC);
CREATE INDEX generated_media_processing_idx ON generated_media (status) WHERE status = 'processing';

-- Voices a workspace cloned. ElevenLabs voices belong to the server's ElevenLabs account, so each
-- workspace only sees (and uses) its own clones plus the standard voices.
CREATE TABLE workspace_voices (
  workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  voice_id text NOT NULL CHECK (char_length(voice_id) <= 100),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  -- Who confirmed they have the speaker's permission to clone this voice.
  consent_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, voice_id)
);
CREATE UNIQUE INDEX workspace_voices_voice_idx ON workspace_voices (voice_id);
