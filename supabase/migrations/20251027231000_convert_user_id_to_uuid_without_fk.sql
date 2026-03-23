/*
  # Convert user_id from Text to UUID (Without Foreign Keys)

  ## Summary
  Converts user_id columns from text to uuid for better scalability.
  Uses client-generated UUIDs (no foreign key constraints to auth.users).
  This allows anonymous users with UUID identifiers.

  ## Changes
  - Convert documents.user_id from text to uuid
  - Convert extracted_events.user_id from text to uuid
  - Convert calendar_events.user_id from text to uuid (if exists)
  - Convert user_preferences.user_id from text to uuid (if exists)
  - NO foreign key constraints (allows anonymous UUIDs)

  ## Important
  - This assumes existing data is empty or can be cleared
  - If you have existing text user IDs, they will be lost
  - App code must be updated to generate UUIDs instead of text IDs
*/

-- First, let's check if we need to clear existing data
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM documents LIMIT 1) THEN
    RAISE NOTICE 'WARNING: documents table has data. This migration will lose existing text user_ids.';
  END IF;
  IF EXISTS (SELECT 1 FROM extracted_events LIMIT 1) THEN
    RAISE NOTICE 'WARNING: extracted_events table has data. This migration will lose existing text user_ids.';
  END IF;
END $$;

-- Convert documents.user_id: text -> uuid
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'documents' 
      AND column_name = 'user_id' 
      AND data_type = 'text'
  ) THEN
    -- Drop any constraints first
    ALTER TABLE documents 
      DROP CONSTRAINT IF EXISTS documents_user_id_fkey;
    
    -- Clear existing data with text user_ids (they can't be converted)
    DELETE FROM extracted_events; -- Delete first due to foreign key
    DELETE FROM documents;
    
    -- Convert column type
    ALTER TABLE documents 
      ALTER COLUMN user_id TYPE uuid USING gen_random_uuid();
    
    RAISE NOTICE 'Converted documents.user_id from text to uuid';
  ELSE
    RAISE NOTICE 'documents.user_id is already uuid or does not exist';
  END IF;
END $$;

-- Convert extracted_events.user_id: text -> uuid
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'extracted_events' 
      AND column_name = 'user_id' 
      AND data_type = 'text'
  ) THEN
    -- Drop any constraints first
    ALTER TABLE extracted_events 
      DROP CONSTRAINT IF EXISTS extracted_events_user_id_fkey;
    
    -- Convert column type (data already cleared above)
    ALTER TABLE extracted_events 
      ALTER COLUMN user_id TYPE uuid USING gen_random_uuid();
    
    RAISE NOTICE 'Converted extracted_events.user_id from text to uuid';
  ELSE
    RAISE NOTICE 'extracted_events.user_id is already uuid or does not exist';
  END IF;
END $$;

-- Convert calendar_events.user_id: text -> uuid (if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calendar_events' 
      AND column_name = 'user_id' 
      AND data_type = 'text'
  ) THEN
    -- Clear existing data
    DELETE FROM calendar_events;
    
    -- Convert column type
    ALTER TABLE calendar_events 
      ALTER COLUMN user_id TYPE uuid USING gen_random_uuid();
    
    RAISE NOTICE 'Converted calendar_events.user_id from text to uuid';
  ELSE
    RAISE NOTICE 'calendar_events.user_id is already uuid or does not exist';
  END IF;
END $$;

-- Convert user_preferences.user_id: text -> uuid (if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_preferences' 
      AND column_name = 'user_id' 
      AND data_type = 'text'
  ) THEN
    -- Clear existing data
    DELETE FROM user_preferences;
    
    -- Drop unique constraint first (must use ALTER TABLE, not ALTER COLUMN)
    ALTER TABLE user_preferences 
      DROP CONSTRAINT IF EXISTS user_preferences_user_id_key;
    
    -- Convert column type
    ALTER TABLE user_preferences 
      ALTER COLUMN user_id TYPE uuid USING gen_random_uuid();
    
    -- Re-add unique constraint
    ALTER TABLE user_preferences 
      ADD CONSTRAINT user_preferences_user_id_key UNIQUE (user_id);
    
    RAISE NOTICE 'Converted user_preferences.user_id from text to uuid';
  ELSE
    RAISE NOTICE 'user_preferences.user_id is already uuid or does not exist';
  END IF;
END $$;

-- Verify the changes
DO $$
BEGIN
  RAISE NOTICE 'Verification:';
  RAISE NOTICE 'documents.user_id type: %', (
    SELECT data_type FROM information_schema.columns 
    WHERE table_name = 'documents' AND column_name = 'user_id'
  );
  RAISE NOTICE 'extracted_events.user_id type: %', (
    SELECT data_type FROM information_schema.columns 
    WHERE table_name = 'extracted_events' AND column_name = 'user_id'
  );
  RAISE NOTICE 'calendar_events.user_id type: %', (
    SELECT COALESCE((SELECT data_type FROM information_schema.columns 
    WHERE table_name = 'calendar_events' AND column_name = 'user_id'), 'table does not exist')
  );
END $$;

