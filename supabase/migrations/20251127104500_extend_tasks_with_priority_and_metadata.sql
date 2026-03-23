/*
  # Extend tasks with richer priority + metadata

  ## Summary
  Aligns the core tasks schema with the AI-driven Create Task experience by:
  - Renaming legacy priority/progress columns to their simplified counterparts.
  - Adding structured goal, location, due time, and metadata capture.
  - Tightening indexes so priority-first queries stay fast.
*/

-- Rename legacy columns when present so existing data is preserved
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'priority_level'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'priority'
  ) THEN
    ALTER TABLE tasks RENAME COLUMN priority_level TO priority;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'progress_percent'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'progress'
  ) THEN
    ALTER TABLE tasks RENAME COLUMN progress_percent TO progress;
  END IF;
END $$;

ALTER TABLE tasks
  ALTER COLUMN priority SET DEFAULT 'medium',
  ALTER COLUMN progress SET DEFAULT 0;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS goal text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS due_time time without time zone,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Ensure priority + progress values remain constrained
ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_priority_valid,
  ADD CONSTRAINT tasks_priority_valid CHECK (priority IN ('critical', 'high', 'medium', 'low'));

ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_progress_range,
  ADD CONSTRAINT tasks_progress_range CHECK (progress BETWEEN 0 AND 100);

CREATE INDEX IF NOT EXISTS idx_tasks_user_priority ON tasks(user_id, priority);


