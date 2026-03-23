/*
  # Add Recurring Events Support

  ## Summary
  Add support for recurring events without explicit dates. Events can recur weekly
  within a semester/term window, allowing extraction of patterns like "Office Hours: 
  Tuesdays 3pm" and expanding them into individual weekly occurrences.

  ## New Tables

  ### `semester_windows`
  Stores semester/term date ranges extracted from documents
  - `id` (uuid, primary key) - Unique identifier
  - `user_id` (text) - User identifier
  - `document_id` (uuid) - Source document reference
  - `name` (text) - Semester name (e.g., "Fall 2025", "Spring 2026")
  - `start_date` (date) - Semester start date
  - `end_date` (date) - Semester end date
  - `is_active` (boolean) - Whether this is the active semester
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ## Changes to extracted_events

  Add columns to support recurring events:
  - `recurrence_rule` (text) - Recurrence pattern (e.g., "WEEKLY:TU", "WEEKLY:MO,WE,FR")
  - `recurrence_parent_id` (uuid) - Links expanded instances to parent recurring event
  - `is_recurring` (boolean) - Whether this is a recurring event
  - `semester_window_id` (uuid) - Links to semester window for date range
  - `is_all_day` (boolean) - Whether event is all-day

  ## Security
  - Enable RLS on semester_windows table
  - Public access policies for all operations
*/

-- Create semester_windows table
CREATE TABLE IF NOT EXISTS semester_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add recurring event support columns to extracted_events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'extracted_events' AND column_name = 'recurrence_rule'
  ) THEN
    ALTER TABLE extracted_events ADD COLUMN recurrence_rule text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'extracted_events' AND column_name = 'recurrence_parent_id'
  ) THEN
    ALTER TABLE extracted_events ADD COLUMN recurrence_parent_id uuid REFERENCES extracted_events(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'extracted_events' AND column_name = 'is_recurring'
  ) THEN
    ALTER TABLE extracted_events ADD COLUMN is_recurring boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'extracted_events' AND column_name = 'semester_window_id'
  ) THEN
    ALTER TABLE extracted_events ADD COLUMN semester_window_id uuid REFERENCES semester_windows(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'extracted_events' AND column_name = 'is_all_day'
  ) THEN
    ALTER TABLE extracted_events ADD COLUMN is_all_day boolean DEFAULT false;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_semester_windows_user_id ON semester_windows(user_id);
CREATE INDEX IF NOT EXISTS idx_semester_windows_active ON semester_windows(is_active);
CREATE INDEX IF NOT EXISTS idx_extracted_events_recurring ON extracted_events(is_recurring);
CREATE INDEX IF NOT EXISTS idx_extracted_events_parent ON extracted_events(recurrence_parent_id);
CREATE INDEX IF NOT EXISTS idx_extracted_events_semester ON extracted_events(semester_window_id);

-- Enable RLS
ALTER TABLE semester_windows ENABLE ROW LEVEL SECURITY;

-- Public policies for semester_windows
CREATE POLICY "Public can view semester windows"
  ON semester_windows FOR SELECT
  USING (true);

CREATE POLICY "Public can insert semester windows"
  ON semester_windows FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public can update semester windows"
  ON semester_windows FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can delete semester windows"
  ON semester_windows FOR DELETE
  USING (true);

-- Enable realtime for semester_windows
ALTER PUBLICATION supabase_realtime ADD TABLE semester_windows;