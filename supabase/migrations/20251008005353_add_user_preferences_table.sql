/*
  # Create User Preferences Table

  ## Summary
  Create table for storing user display preferences including dark mode, dense mode,
  and overnight hours visibility settings.

  ## New Tables
  
  ### `user_preferences`
  Storage for user-specific UI preferences
  - `id` (uuid, primary key) - Unique preference record identifier
  - `user_id` (text, unique) - User identifier (can be anonymous)
  - `dark_mode` (boolean) - Whether dark mode is enabled
  - `dense_mode` (boolean) - Whether dense display mode is enabled
  - `show_overnight_hours` (boolean) - Whether to show overnight hours (12 AM - 6 AM)
  - `created_at` (timestamptz) - Preference record creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ## Security
  - Enable RLS on user_preferences table
  - Public access allowed for all operations
*/

CREATE TABLE IF NOT EXISTS user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text UNIQUE NOT NULL,
  dark_mode boolean DEFAULT false,
  dense_mode boolean DEFAULT false,
  show_overnight_hours boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view all user preferences"
  ON user_preferences FOR SELECT
  USING (true);

CREATE POLICY "Public can insert user preferences"
  ON user_preferences FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public can update user preferences"
  ON user_preferences FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can delete user preferences"
  ON user_preferences FOR DELETE
  USING (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column'
  ) THEN
    CREATE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $func$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON user_preferences;
CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
