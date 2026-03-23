-- # Create API Keys Table
--
-- 1. New Tables
--    - `api_keys`
--      - `id` (uuid, primary key) - Unique identifier for each API key record
--      - `user_id` (uuid, not null) - References auth.users, links key to a user
--      - `service_name` (text, not null) - Name of the service (e.g., 'openai')
--      - `api_key` (text, not null) - The encrypted API key value
--      - `created_at` (timestamptz) - Timestamp of when the key was created
--      - `updated_at` (timestamptz) - Timestamp of last update
--
-- 2. Security
--    - Enable RLS on `api_keys` table
--    - Add policy for users to read their own API keys
--    - Add policy for users to insert their own API keys
--    - Add policy for users to update their own API keys
--    - Add policy for users to delete their own API keys

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_name text NOT NULL,
  api_key text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, service_name)
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own API keys"
  ON api_keys
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own API keys"
  ON api_keys
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own API keys"
  ON api_keys
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own API keys"
  ON api_keys
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);