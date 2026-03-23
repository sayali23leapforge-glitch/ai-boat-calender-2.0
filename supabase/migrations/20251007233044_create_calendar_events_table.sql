/*
  # Create Calendar Events Table

  ## Summary
  Create table for storing calendar events from various sources including OCR-extracted events. This version allows public access without authentication.

  ## New Tables
  
  ### `calendar_events`
  Central storage for all calendar events across different sources
  - `id` (uuid, primary key) - Unique event identifier
  - `user_id` (text) - User identifier (can be anonymous)
  - `title` (text) - Event title
  - `description` (text) - Event description (optional)
  - `event_date` (date) - Event date
  - `start_time` (time) - Event start time (optional)
  - `end_time` (time) - Event end time (optional)
  - `location` (text) - Event location (optional)
  - `category` (text) - Event category
  - `priority` (text) - Priority level
  - `source` (text) - Event source: 'manual', 'extracted', 'google_calendar', 'email'
  - `source_id` (text) - Reference ID from source system (optional)
  - `is_completed` (boolean) - Whether event is completed
  - `created_at` (timestamptz) - Event creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ## Security
  - Enable RLS on calendar_events table
  - Public access allowed for all operations
*/

CREATE TABLE IF NOT EXISTS calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  title text NOT NULL,
  description text,
  event_date date NOT NULL,
  start_time time,
  end_time time,
  location text,
  category text NOT NULL DEFAULT 'other' CHECK (category IN ('assignment', 'exam', 'meeting', 'deadline', 'milestone', 'other')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'extracted', 'google_calendar', 'email')),
  source_id text,
  is_completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_user_id ON calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(event_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_source ON calendar_events(source);
CREATE INDEX IF NOT EXISTS idx_calendar_events_completed ON calendar_events(is_completed);
CREATE INDEX IF NOT EXISTS idx_calendar_events_priority ON calendar_events(priority);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view all calendar events"
  ON calendar_events FOR SELECT
  USING (true);

CREATE POLICY "Public can insert calendar events"
  ON calendar_events FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public can update calendar events"
  ON calendar_events FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can delete calendar events"
  ON calendar_events FOR DELETE
  USING (true);

DROP TRIGGER IF EXISTS update_calendar_events_updated_at ON calendar_events;
CREATE TRIGGER update_calendar_events_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();