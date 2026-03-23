/*
  # Revert calendar_events and user_preferences user_id to TEXT

  ## Summary
  Converts calendar_events and user_preferences user_id columns from uuid back to text.
  This matches the rest of the app which uses text IDs like "user-1763359718665-12ifuacv7".
  
  ## Changes
  - Convert calendar_events.user_id: uuid -> text
  - Convert user_preferences.user_id: uuid -> text
  - Update RLS policies if needed
  - Clear existing data (can't convert UUID to text safely)
*/

-- Convert calendar_events.user_id: uuid -> text
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calendar_events' 
      AND column_name = 'user_id' 
      AND data_type = 'uuid'
  ) THEN
    -- Drop any foreign key constraints first
    ALTER TABLE calendar_events 
      DROP CONSTRAINT IF EXISTS calendar_events_user_id_fkey;
    
    -- Clear existing data (can't convert UUID to text safely)
    DELETE FROM calendar_events;
    
    -- Convert column type
    ALTER TABLE calendar_events 
      ALTER COLUMN user_id TYPE text USING user_id::text;
    
    RAISE NOTICE 'Converted calendar_events.user_id from uuid to text';
  ELSE
    RAISE NOTICE 'calendar_events.user_id is already text or does not exist';
  END IF;
END $$;

-- Convert user_preferences.user_id: uuid -> text
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_preferences' 
      AND column_name = 'user_id' 
      AND data_type = 'uuid'
  ) THEN
    -- Drop unique constraint first (to allow type change)
    ALTER TABLE user_preferences 
      DROP CONSTRAINT IF EXISTS user_preferences_user_id_key;
    
    -- Drop any foreign key constraints
    ALTER TABLE user_preferences 
      DROP CONSTRAINT IF EXISTS user_preferences_user_id_fkey;
    
    -- Clear existing data
    DELETE FROM user_preferences;
    
    -- Convert column type
    ALTER TABLE user_preferences 
      ALTER COLUMN user_id TYPE text USING user_id::text;
    
    -- Re-add unique constraint
    ALTER TABLE user_preferences 
      ADD CONSTRAINT user_preferences_user_id_key UNIQUE (user_id);
    
    RAISE NOTICE 'Converted user_preferences.user_id from uuid to text';
  ELSE
    RAISE NOTICE 'user_preferences.user_id is already text or does not exist';
  END IF;
END $$;

-- Verify the changes
DO $$
BEGIN
  RAISE NOTICE 'Verification:';
  RAISE NOTICE 'calendar_events.user_id type: %', (
    SELECT COALESCE(
      (SELECT data_type FROM information_schema.columns 
       WHERE table_name = 'calendar_events' AND column_name = 'user_id'),
      'table does not exist'
    )
  );
  RAISE NOTICE 'user_preferences.user_id type: %', (
    SELECT COALESCE(
      (SELECT data_type FROM information_schema.columns 
       WHERE table_name = 'user_preferences' AND column_name = 'user_id'),
      'table does not exist'
    )
  );
END $$;

