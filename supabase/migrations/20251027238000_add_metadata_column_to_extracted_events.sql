/*
  # Add metadata column to extracted_events

  ## Summary
  Adds the `metadata` jsonb column to `extracted_events` table if it doesn't exist.
  This column is used to store extraction metadata like date_text, normalized_end_date, and line_number.
*/

-- Add metadata column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'extracted_events' 
    AND column_name = 'metadata'
  ) THEN
    ALTER TABLE extracted_events 
    ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb;
    
    RAISE NOTICE 'Added metadata column to extracted_events table';
  ELSE
    RAISE NOTICE 'metadata column already exists in extracted_events table';
  END IF;
END $$;

