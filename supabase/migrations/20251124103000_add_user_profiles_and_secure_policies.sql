/*
  # Secure user data & add profiles

  - Create user_profiles table keyed to auth.users
  - Tighten RLS policies on documents, extracted_events, calendar_events, user_preferences
*/

-- Ensure helper function exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $func$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;
  END IF;
END $$;

-- User profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  avatar_url text,
  onboarding_complete boolean DEFAULT false,
  last_sign_in timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Users can manage own profile' AND tablename = 'user_profiles'
  ) THEN
    CREATE POLICY "Users can manage own profile"
      ON user_profiles
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Restrictive policies for documents
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'documents') THEN
    DROP POLICY IF EXISTS "Public can view all documents" ON documents;
    DROP POLICY IF EXISTS "Public can insert documents" ON documents;
    DROP POLICY IF EXISTS "Public can update documents" ON documents;
    DROP POLICY IF EXISTS "Public can delete documents" ON documents;
  END IF;
END $$;

CREATE POLICY "Users can view own documents"
  ON documents FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own documents"
  ON documents FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own documents"
  ON documents FOR UPDATE
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own documents"
  ON documents FOR DELETE
  USING (auth.uid()::text = user_id);

-- Restrictive policies for extracted_events
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'extracted_events') THEN
    DROP POLICY IF EXISTS "Public can view all extracted events" ON extracted_events;
    DROP POLICY IF EXISTS "Public can insert extracted events" ON extracted_events;
    DROP POLICY IF EXISTS "Public can update extracted events" ON extracted_events;
    DROP POLICY IF EXISTS "Public can delete extracted events" ON extracted_events;
  END IF;
END $$;

CREATE POLICY "Users can view own extracted events"
  ON extracted_events FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own extracted events"
  ON extracted_events FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own extracted events"
  ON extracted_events FOR UPDATE
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own extracted events"
  ON extracted_events FOR DELETE
  USING (auth.uid()::text = user_id);

-- Restrictive policies for calendar_events
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_events') THEN
    DROP POLICY IF EXISTS "Public can view all calendar events" ON calendar_events;
    DROP POLICY IF EXISTS "Public can insert calendar events" ON calendar_events;
    DROP POLICY IF EXISTS "Public can update calendar events" ON calendar_events;
    DROP POLICY IF EXISTS "Public can delete calendar events" ON calendar_events;
  END IF;
END $$;

CREATE POLICY "Users can view own calendar events"
  ON calendar_events FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own calendar events"
  ON calendar_events FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own calendar events"
  ON calendar_events FOR UPDATE
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own calendar events"
  ON calendar_events FOR DELETE
  USING (auth.uid()::text = user_id);

-- Restrictive policies for user_preferences
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_preferences') THEN
    DROP POLICY IF EXISTS "Public can view all user preferences" ON user_preferences;
    DROP POLICY IF EXISTS "Public can insert user preferences" ON user_preferences;
    DROP POLICY IF EXISTS "Public can update user preferences" ON user_preferences;
    DROP POLICY IF EXISTS "Public can delete user preferences" ON user_preferences;
  END IF;
END $$;

CREATE POLICY "Users can manage own preferences"
  ON user_preferences
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

