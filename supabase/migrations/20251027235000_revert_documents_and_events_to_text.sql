/*
  # Revert documents and extracted_events user_id to TEXT

  ## Summary
  Converts documents and extracted_events user_id columns from uuid back to text.
  This matches the rest of the app which uses text IDs like "user-1763359718665-12ifuacv7".
  
  ## Changes
  - Convert documents.user_id: uuid -> text
  - Convert extracted_events.user_id: uuid -> text
  - Clear existing data (can't convert UUID to text safely)
*/

-- Convert documents.user_id: uuid -> text
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'documents' 
      AND column_name = 'user_id' 
      AND data_type = 'uuid'
  ) THEN
    -- Drop any foreign key constraints first
    ALTER TABLE documents 
      DROP CONSTRAINT IF EXISTS documents_user_id_fkey;
    
    -- Clear existing data (can't convert UUID to text safely)
    -- Delete extracted_events first due to foreign key
    DELETE FROM extracted_events;
    DELETE FROM documents;
    
    -- Convert column type
    ALTER TABLE documents 
      ALTER COLUMN user_id TYPE text USING user_id::text;
    
    RAISE NOTICE 'Converted documents.user_id from uuid to text';
  ELSE
    RAISE NOTICE 'documents.user_id is already text or does not exist';
  END IF;
END $$;

-- Convert extracted_events.user_id: uuid -> text
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'extracted_events' 
      AND column_name = 'user_id' 
      AND data_type = 'uuid'
  ) THEN
    -- Drop any foreign key constraints first
    ALTER TABLE extracted_events 
      DROP CONSTRAINT IF EXISTS extracted_events_user_id_fkey;
    
    -- Convert column type (data already cleared above)
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
    SELECT COALESCE(
      (SELECT data_type FROM information_schema.columns 
       WHERE table_name = 'documents' AND column_name = 'user_id'),
      'table does not exist'
    )
  );
  RAISE NOTICE 'extracted_events.user_id type: %', (
    SELECT COALESCE(
      (SELECT data_type FROM information_schema.columns 
       WHERE table_name = 'extracted_events' AND column_name = 'user_id'),
      'table does not exist'
    )
  );
END $$;

