-- Fix missing tables - Create all required tables from scratch
-- This migration creates:
-- 1. documents table
-- 2. extracted_events table
-- 3. api_keys table

-- 1. Create documents table if it doesn't exist
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  name text NOT NULL,
  file_type text,
  file_size integer,
  storage_path text NOT NULL,
  status text DEFAULT 'pending',
  progress integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  metadata jsonb
);

-- Create index on user_id for better query performance
CREATE INDEX IF NOT EXISTS documents_user_id_idx ON documents(user_id);
CREATE INDEX IF NOT EXISTS documents_created_at_idx ON documents(created_at DESC);

-- 2. Create extracted_events table if it doesn't exist
CREATE TABLE IF NOT EXISTS extracted_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  title text NOT NULL,
  description text,
  event_date date NOT NULL,
  start_time time,
  end_time time,
  location text,
  priority text DEFAULT 'medium',
  is_completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  metadata jsonb
);

-- Create indexes on extracted_events
CREATE INDEX IF NOT EXISTS extracted_events_user_id_idx ON extracted_events(user_id);
CREATE INDEX IF NOT EXISTS extracted_events_document_id_idx ON extracted_events(document_id);
CREATE INDEX IF NOT EXISTS extracted_events_event_date_idx ON extracted_events(event_date);

-- 3. Create api_keys table if it doesn't exist
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  service_name text NOT NULL,
  api_key text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, service_name)
);

-- Create index on api_keys
CREATE INDEX IF NOT EXISTS api_keys_user_id_idx ON api_keys(user_id);

-- Enable RLS on all tables
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- RLS Policies for documents
DROP POLICY IF EXISTS "Users can read own documents" ON documents;
CREATE POLICY "Users can read own documents"
  ON documents
  FOR SELECT
  USING (user_id = current_user_id());

DROP POLICY IF EXISTS "Users can insert own documents" ON documents;
CREATE POLICY "Users can insert own documents"
  ON documents
  FOR INSERT
  WITH CHECK (user_id = current_user_id());

DROP POLICY IF EXISTS "Users can update own documents" ON documents;
CREATE POLICY "Users can update own documents"
  ON documents
  FOR UPDATE
  USING (user_id = current_user_id())
  WITH CHECK (user_id = current_user_id());

DROP POLICY IF EXISTS "Users can delete own documents" ON documents;
CREATE POLICY "Users can delete own documents"
  ON documents
  FOR DELETE
  USING (user_id = current_user_id());

-- RLS Policies for extracted_events
DROP POLICY IF EXISTS "Users can read own extracted events" ON extracted_events;
CREATE POLICY "Users can read own extracted events"
  ON extracted_events
  FOR SELECT
  USING (user_id = current_user_id());

DROP POLICY IF EXISTS "Users can insert own extracted events" ON extracted_events;
CREATE POLICY "Users can insert own extracted events"
  ON extracted_events
  FOR INSERT
  WITH CHECK (user_id = current_user_id());

DROP POLICY IF EXISTS "Users can update own extracted events" ON extracted_events;
CREATE POLICY "Users can update own extracted events"
  ON extracted_events
  FOR UPDATE
  USING (user_id = current_user_id())
  WITH CHECK (user_id = current_user_id());

DROP POLICY IF EXISTS "Users can delete own extracted events" ON extracted_events;
CREATE POLICY "Users can delete own extracted events"
  ON extracted_events
  FOR DELETE
  USING (user_id = current_user_id());

-- RLS Policies for api_keys
DROP POLICY IF EXISTS "Users can read own API keys" ON api_keys;
CREATE POLICY "Users can read own API keys"
  ON api_keys
  FOR SELECT
  USING (user_id = current_user_id());

DROP POLICY IF EXISTS "Users can insert own API keys" ON api_keys;
CREATE POLICY "Users can insert own API keys"
  ON api_keys
  FOR INSERT
  WITH CHECK (user_id = current_user_id());

DROP POLICY IF EXISTS "Users can update own API keys" ON api_keys;
CREATE POLICY "Users can update own API keys"
  ON api_keys
  FOR UPDATE
  USING (user_id = current_user_id())
  WITH CHECK (user_id = current_user_id());

DROP POLICY IF EXISTS "Users can delete own API keys" ON api_keys;
CREATE POLICY "Users can delete own API keys"
  ON api_keys
  FOR DELETE
  USING (user_id = current_user_id());

-- Helper function to get current user ID (since it's text, not UUID)
-- Note: This uses the auth.uid() from Supabase which is UUID, but we can use JWT claims
CREATE OR REPLACE FUNCTION current_user_id() RETURNS text AS $$
  SELECT (auth.jwt() ->> 'sub')::text;
$$ LANGUAGE sql STABLE;
