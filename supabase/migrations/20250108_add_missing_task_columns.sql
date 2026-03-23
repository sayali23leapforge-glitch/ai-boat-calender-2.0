/*
  # Add missing columns to tasks table

  ## Summary
  This migration adds the columns needed for the task creation feature to work.
  Run this in your Supabase SQL Editor if tasks are missing columns like due_time, priority, etc.

  ## Changes
  - Add due_time (time without time zone) - For task due times
  - Add priority (text) - For task priority levels  
  - Add estimated_hours (numeric) - For effort estimation
  - Add progress (integer) - For task progress tracking
  - Add goal (text) - For goal capture
  - Add location (text) - For task location
  - Add metadata (jsonb) - For flexible task metadata
*/

-- Add missing columns to tasks table if they don't exist
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS due_time time without time zone,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS estimated_hours numeric,
  ADD COLUMN IF NOT EXISTS progress integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS goal text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Add constraints
ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_priority_check,
  ADD CONSTRAINT tasks_priority_check CHECK (priority IN ('critical', 'high', 'medium', 'low'));

ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_progress_check,
  ADD CONSTRAINT tasks_progress_check CHECK (progress >= 0 AND progress <= 100);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_progress ON tasks(progress);
