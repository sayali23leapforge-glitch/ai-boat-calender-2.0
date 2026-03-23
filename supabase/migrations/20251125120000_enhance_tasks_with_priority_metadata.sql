/*
  # Enhance tasks with priority metadata

  ## Summary
  Adds richer prioritization signals directly to the tasks table so the
  Priority Dashboard can query consistent progress, effort, and urgency data.

  ## Changes
  - Adds `priority_level` text column constrained to our four priority buckets.
  - Adds `estimated_hours` numeric column for effort sizing.
  - Adds `progress_percent` smallint column clamped between 0-100.
  - Backfills existing rows with sensible defaults based on completion/starred state.
  - Adds a composite index to accelerate priority dashboards.
*/

ALTER TABLE tasks
  ADD COLUMN priority_level text NOT NULL DEFAULT 'medium' CHECK (priority_level IN ('critical', 'high', 'medium', 'low')),
  ADD COLUMN estimated_hours numeric(6,2),
  ADD COLUMN progress_percent smallint NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100);

-- Ensure completed tasks show 100% progress and starred tasks default to high priority
UPDATE tasks
SET progress_percent = 100
WHERE is_completed = true;

UPDATE tasks
SET priority_level = 'high'
WHERE is_starred = true
  AND priority_level = 'medium';

-- Provide a deterministic value for tasks that remain without due dates or estimates
UPDATE tasks
SET estimated_hours = 1
WHERE estimated_hours IS NULL
  AND is_starred = true;

CREATE INDEX IF NOT EXISTS idx_tasks_user_priority_due ON tasks(user_id, priority_level, due_date);

