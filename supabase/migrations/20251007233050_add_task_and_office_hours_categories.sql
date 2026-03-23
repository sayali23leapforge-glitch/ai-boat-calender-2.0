/*
  # Add Task and Office Hours Categories

  ## Summary
  Expand category options to include 'task' and 'office_hours' for more granular event classification.

  ## Changes to extracted_events
  - Update category constraint to include 'task' and 'office_hours'

  ## Changes to calendar_events
  - Update category constraint to include 'task' and 'office_hours'
*/

-- Update extracted_events category constraint
ALTER TABLE extracted_events DROP CONSTRAINT IF EXISTS extracted_events_category_check;
ALTER TABLE extracted_events ADD CONSTRAINT extracted_events_category_check 
  CHECK (category IN ('assignment', 'exam', 'meeting', 'deadline', 'milestone', 'task', 'office_hours', 'other'));

-- Update calendar_events category constraint
ALTER TABLE calendar_events DROP CONSTRAINT IF EXISTS calendar_events_category_check;
ALTER TABLE calendar_events ADD CONSTRAINT calendar_events_category_check 
  CHECK (category IN ('assignment', 'exam', 'meeting', 'deadline', 'milestone', 'task', 'office_hours', 'other'));