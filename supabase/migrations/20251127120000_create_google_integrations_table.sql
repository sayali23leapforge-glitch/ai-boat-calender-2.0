/*
  # Google Integrations

  ## Summary
  Store OAuth tokens and sync metadata for Google workspace connectors (Gmail, Calendar, Meet).
  Enables per-user integration settings, disconnect controls, and last-sync auditing.
*/

CREATE TABLE IF NOT EXISTS google_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'google',
  services text[] NOT NULL DEFAULT ARRAY['calendar']::text[],
  scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'connected', 'error', 'disconnected')),
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  last_synced_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_google_integrations_user ON google_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_google_integrations_status ON google_integrations(status);

ALTER TABLE google_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own integrations"
  ON google_integrations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own integrations"
  ON google_integrations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own integrations"
  ON google_integrations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own integrations"
  ON google_integrations FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_google_integrations_updated_at ON google_integrations;
CREATE TRIGGER update_google_integrations_updated_at
  BEFORE UPDATE ON google_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


