/*
  # Add Task and Office Hours Categories

  ## Summary
  Expand the category options to include 'task' for homework/assignments and 'office_hours' 
  for recurring availability periods. This allows better organization of events vs tasks.

  ## Changes
  - Add 'task' and 'office_hours' to the category constraint on extracted_events table
  - Add 'task' and 'office_hours' to the category constraint on calendar_events table (if exists)

  ## Categories
  - **task**: Homework, assignments, to-dos (actionable items)
  - **office_hours**: Instructor/professor availability, recurring support times
  - **assignment**: Formal assignments (kept for backward compatibility)
  - **exam**: Tests, quizzes, examinations
  - **meeting**: Scheduled meetings, conferences
  - **deadline**: Due dates, submission deadlines
  - **milestone**: Project milestones, major deliverables
  - **other**: Miscellaneous events
*/

-- Update extracted_events category constraint
ALTER TABLE extracted_events 
  DROP CONSTRAINT IF EXISTS extracted_events_category_check;

ALTER TABLE extracted_events 
  ADD CONSTRAINT extracted_events_category_check 
  CHECK (category IN ('task', 'assignment', 'exam', 'meeting', 'deadline', 'milestone', 'office_hours', 'other'));

-- Update calendar_events category constraint if table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'calendar_events' AND table_schema = 'public'
  ) THEN
    ALTER TABLE calendar_events 
      DROP CONSTRAINT IF EXISTS calendar_events_category_check;
    
    ALTER TABLE calendar_events 
      ADD CONSTRAINT calendar_events_category_check 
      CHECK (category IN ('task', 'assignment', 'exam', 'meeting', 'deadline', 'milestone', 'office_hours', 'other'));
  END IF;
END $$;
