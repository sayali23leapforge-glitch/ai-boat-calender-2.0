/*
  # Enhanced Recurring Events System with Series & Detection

  ## Summary
  This migration creates a comprehensive recurring events system that:
  1. Stores event series with RRULE patterns (RFC 5545 compliant)
  2. Tracks individual event instances with overrides
  3. Supports automatic detection of recurring patterns from parsed events
  4. Enables clustering and normalization of similar events

  ## New Tables

  ### `event_series`
  Master table for recurring event definitions
  - `id` (uuid, primary key) - Unique series identifier
  - `user_id` (text) - User identifier
  - `title` (text) - Series title
  - `normalized_title` (text) - Lowercase, normalized title for clustering
  - `description` (text) - Series description
  - `start_date` (date) - First occurrence date (DTSTART)
  - `start_time` (time) - Event start time
  - `end_time` (time) - Event end time
  - `duration_minutes` (int) - Event duration in minutes
  - `location` (text) - Event location
  - `category` (text) - Event category
  - `priority` (text) - Priority level
  - `rrule` (text) - RFC 5545 RRULE string (e.g., "FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20251215")
  - `exdates` (jsonb) - Array of exception dates (skipped occurrences)
  - `until_date` (date) - Series end date (extracted from RRULE UNTIL)
  - `source` (text) - Origin: 'manual', 'extracted', 'detected'
  - `is_active` (boolean) - Whether series is active
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### `event_overrides`
  Stores per-instance modifications to series events
  - `id` (uuid, primary key) - Unique override identifier
  - `series_id` (uuid) - Parent series reference
  - `occurrence_date` (date) - Date of the instance being overridden
  - `title` (text) - Override title (null = use series title)
  - `start_time` (time) - Override start time
  - `end_time` (time) - Override end time
  - `location` (text) - Override location
  - `description` (text) - Override description
  - `is_cancelled` (boolean) - Whether this instance is cancelled
  - `is_completed` (boolean) - Completion status
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### `recurring_candidates`
  Staging table for detected recurring patterns before user confirmation
  - `id` (uuid, primary key) - Unique candidate identifier
  - `user_id` (text) - User identifier
  - `cluster_key` (text) - Normalized grouping key
  - `event_ids` (jsonb) - Array of calendar_event IDs in this cluster
  - `detected_pattern` (text) - Auto-detected RRULE pattern
  - `confidence_score` (float) - Pattern detection confidence (0-1)
  - `title` (text) - Representative title
  - `normalized_title` (text) - Normalized title
  - `start_time` (time) - Common start time
  - `location` (text) - Common location
  - `occurrence_dates` (jsonb) - Array of dates with events
  - `suggested_rrule` (text) - Suggested RRULE for user
  - `status` (text) - 'pending', 'accepted', 'rejected'
  - `created_at` (timestamptz) - Detection timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ## Changes to calendar_events

  Add columns to link events to series:
  - `series_id` (uuid) - Parent series reference (null for standalone events)
  - `occurrence_date` (date) - For series instances, the specific occurrence date
  - `is_series_instance` (boolean) - Whether this is generated from a series

  ## Security
  - Enable RLS on all new tables
  - Public access policies for development (restrict in production)

  ## Indexes
  - Performance indexes on user_id, series_id, dates, and normalized titles
  - GIN index on jsonb columns for efficient array queries
*/

-- Create event_series table
CREATE TABLE IF NOT EXISTS event_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  title text NOT NULL,
  normalized_title text NOT NULL,
  description text,
  start_date date NOT NULL,
  start_time time,
  end_time time,
  duration_minutes integer,
  location text,
  category text NOT NULL DEFAULT 'other' CHECK (category IN ('assignment', 'exam', 'meeting', 'deadline', 'milestone', 'other')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  rrule text NOT NULL,
  exdates jsonb DEFAULT '[]'::jsonb,
  until_date date,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'extracted', 'detected')),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create event_overrides table
CREATE TABLE IF NOT EXISTS event_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id uuid NOT NULL REFERENCES event_series(id) ON DELETE CASCADE,
  occurrence_date date NOT NULL,
  title text,
  start_time time,
  end_time time,
  location text,
  description text,
  is_cancelled boolean DEFAULT false,
  is_completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(series_id, occurrence_date)
);

-- Create recurring_candidates table
CREATE TABLE IF NOT EXISTS recurring_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  cluster_key text NOT NULL,
  event_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  detected_pattern text,
  confidence_score float DEFAULT 0.0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  title text NOT NULL,
  normalized_title text NOT NULL,
  start_time time,
  location text,
  occurrence_dates jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_rrule text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add series columns to calendar_events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calendar_events' AND column_name = 'series_id'
  ) THEN
    ALTER TABLE calendar_events ADD COLUMN series_id uuid REFERENCES event_series(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calendar_events' AND column_name = 'occurrence_date'
  ) THEN
    ALTER TABLE calendar_events ADD COLUMN occurrence_date date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calendar_events' AND column_name = 'is_series_instance'
  ) THEN
    ALTER TABLE calendar_events ADD COLUMN is_series_instance boolean DEFAULT false;
  END IF;
END $$;

-- Create indexes for event_series
CREATE INDEX IF NOT EXISTS idx_event_series_user_id ON event_series(user_id);
CREATE INDEX IF NOT EXISTS idx_event_series_start_date ON event_series(start_date);
CREATE INDEX IF NOT EXISTS idx_event_series_until_date ON event_series(until_date);
CREATE INDEX IF NOT EXISTS idx_event_series_normalized_title ON event_series(normalized_title);
CREATE INDEX IF NOT EXISTS idx_event_series_active ON event_series(is_active);
CREATE INDEX IF NOT EXISTS idx_event_series_source ON event_series(source);

-- Create indexes for event_overrides
CREATE INDEX IF NOT EXISTS idx_event_overrides_series_id ON event_overrides(series_id);
CREATE INDEX IF NOT EXISTS idx_event_overrides_occurrence_date ON event_overrides(occurrence_date);
CREATE INDEX IF NOT EXISTS idx_event_overrides_cancelled ON event_overrides(is_cancelled);

-- Create indexes for recurring_candidates
CREATE INDEX IF NOT EXISTS idx_recurring_candidates_user_id ON recurring_candidates(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_candidates_cluster_key ON recurring_candidates(cluster_key);
CREATE INDEX IF NOT EXISTS idx_recurring_candidates_status ON recurring_candidates(status);
CREATE INDEX IF NOT EXISTS idx_recurring_candidates_normalized_title ON recurring_candidates(normalized_title);
CREATE INDEX IF NOT EXISTS idx_recurring_candidates_event_ids_gin ON recurring_candidates USING GIN (event_ids);
CREATE INDEX IF NOT EXISTS idx_recurring_candidates_occurrence_dates_gin ON recurring_candidates USING GIN (occurrence_dates);

-- Create index on calendar_events for series lookups
CREATE INDEX IF NOT EXISTS idx_calendar_events_series_id ON calendar_events(series_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_occurrence_date ON calendar_events(occurrence_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_series_instance ON calendar_events(is_series_instance);

-- Enable RLS
ALTER TABLE event_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_candidates ENABLE ROW LEVEL SECURITY;

-- Policies for event_series
CREATE POLICY "Public can view event series"
  ON event_series FOR SELECT
  USING (true);

CREATE POLICY "Public can insert event series"
  ON event_series FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public can update event series"
  ON event_series FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can delete event series"
  ON event_series FOR DELETE
  USING (true);

-- Policies for event_overrides
CREATE POLICY "Public can view event overrides"
  ON event_overrides FOR SELECT
  USING (true);

CREATE POLICY "Public can insert event overrides"
  ON event_overrides FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public can update event overrides"
  ON event_overrides FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can delete event overrides"
  ON event_overrides FOR DELETE
  USING (true);

-- Policies for recurring_candidates
CREATE POLICY "Public can view recurring candidates"
  ON recurring_candidates FOR SELECT
  USING (true);

CREATE POLICY "Public can insert recurring candidates"
  ON recurring_candidates FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public can update recurring candidates"
  ON recurring_candidates FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can delete recurring candidates"
  ON recurring_candidates FOR DELETE
  USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE event_series;
ALTER PUBLICATION supabase_realtime ADD TABLE event_overrides;
ALTER PUBLICATION supabase_realtime ADD TABLE recurring_candidates;
