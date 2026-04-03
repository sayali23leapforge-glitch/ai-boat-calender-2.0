/*
  # Fix user_id Column Type from UUID to Text

  ## Summary
  Fixes the user_id column type in documents and extracted_events tables.
  The old migration created these columns as UUID (referencing auth.users),
  but the app uses anonymous text user IDs like "user-1763359718665-12ifuacv7".

  ## Changes
  - Convert documents.user_id from uuid to text (removes foreign key constraint)
  - Convert extracted_events.user_id from uuid to text (removes foreign key constraint)
  - Only runs if columns are currently uuid type (safe to re-run)
*/

-- Fix documents.user_id: uuid -> text
DO $$
DECLARE
  p record;
BEGIN
  -- Check if user_id is uuid type and needs conversion
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'documents' 
      AND column_name = 'user_id' 
      AND data_type = 'uuid'
  ) THEN
    -- Drop policies that depend on user_id before type conversion
    FOR p IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'documents'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON documents', p.policyname);
    END LOOP;

    -- Drop foreign key constraint if it exists
    ALTER TABLE documents 
      DROP CONSTRAINT IF EXISTS documents_user_id_fkey;
    
    -- Convert column type from uuid to text
    ALTER TABLE documents 
      ALTER COLUMN user_id TYPE text USING user_id::text;
    
    RAISE NOTICE 'Converted documents.user_id from uuid to text';
  ELSE
    RAISE NOTICE 'documents.user_id is already text or does not exist';
  END IF;
END $$;

-- Fix extracted_events.user_id: uuid -> text
DO $$
DECLARE
  p record;
BEGIN
  -- Check if user_id is uuid type and needs conversion
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'extracted_events' 
      AND column_name = 'user_id' 
      AND data_type = 'uuid'
  ) THEN
    -- Drop policies that depend on user_id before type conversion
    FOR p IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'extracted_events'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON extracted_events', p.policyname);
    END LOOP;

    -- Drop foreign key constraint if it exists
    ALTER TABLE extracted_events 
      DROP CONSTRAINT IF EXISTS extracted_events_user_id_fkey;
    
    -- Convert column type from uuid to text
    ALTER TABLE extracted_events 
      ALTER COLUMN user_id TYPE text USING user_id::text;
    
    RAISE NOTICE 'Converted extracted_events.user_id from uuid to text';
  ELSE
    RAISE NOTICE 'extracted_events.user_id is already text or does not exist';
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
END $$;

