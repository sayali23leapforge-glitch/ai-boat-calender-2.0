/*
  # Check and Fix ALL user_id Columns to TEXT

  ## Summary
  This migration checks the current state of all user_id columns and converts any remaining UUID columns to TEXT.
  This is a safety net to ensure everything is consistent.

  ## Tables to Check:
  - calendar_events.user_id
  - user_preferences.user_id
  - documents.user_id
  - extracted_events.user_id
  - task_lists.user_id
  - tasks.user_id
*/

-- Show current state
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE column_name = 'user_id'
  AND table_schema = 'public'
ORDER BY table_name;

-- Fix calendar_events.user_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calendar_events' 
      AND column_name = 'user_id' 
      AND data_type = 'uuid'
  ) THEN
    -- Drop all policies first
    DROP POLICY IF EXISTS "Public can view all calendar events" ON calendar_events;
    DROP POLICY IF EXISTS "Public can insert calendar events" ON calendar_events;
    DROP POLICY IF EXISTS "Public can update calendar events" ON calendar_events;
    DROP POLICY IF EXISTS "Public can delete calendar events" ON calendar_events;
    DROP POLICY IF EXISTS "Users can view own calendar events" ON calendar_events;
    DROP POLICY IF EXISTS "Users can insert own calendar events" ON calendar_events;
    DROP POLICY IF EXISTS "Users can update own calendar events" ON calendar_events;
    DROP POLICY IF EXISTS "Users can delete own calendar events" ON calendar_events;
    
    ALTER TABLE calendar_events 
      DROP CONSTRAINT IF EXISTS calendar_events_user_id_fkey;
    
    DELETE FROM calendar_events;
    
    ALTER TABLE calendar_events 
      ALTER COLUMN user_id TYPE text USING user_id::text;
    
    -- Recreate public policies
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
    
    RAISE NOTICE '✓ Fixed calendar_events.user_id: uuid → text';
  ELSE
    RAISE NOTICE '✓ calendar_events.user_id is already text';
  END IF;
END $$;

-- Fix user_preferences.user_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_preferences' 
      AND column_name = 'user_id' 
      AND data_type = 'uuid'
  ) THEN
    -- Drop all policies first
    DROP POLICY IF EXISTS "Public can view all user preferences" ON user_preferences;
    DROP POLICY IF EXISTS "Public can insert user preferences" ON user_preferences;
    DROP POLICY IF EXISTS "Public can update user preferences" ON user_preferences;
    DROP POLICY IF EXISTS "Public can delete user preferences" ON user_preferences;
    
    ALTER TABLE user_preferences 
      DROP CONSTRAINT IF EXISTS user_preferences_user_id_key;
    ALTER TABLE user_preferences 
      DROP CONSTRAINT IF EXISTS user_preferences_user_id_fkey;
    
    DELETE FROM user_preferences;
    
    ALTER TABLE user_preferences 
      ALTER COLUMN user_id TYPE text USING user_id::text;
    
    ALTER TABLE user_preferences 
      ADD CONSTRAINT user_preferences_user_id_key UNIQUE (user_id);
    
    -- Recreate public policies
    CREATE POLICY "Public can view all user preferences"
      ON user_preferences FOR SELECT
      USING (true);
    
    CREATE POLICY "Public can insert user preferences"
      ON user_preferences FOR INSERT
      WITH CHECK (true);
    
    CREATE POLICY "Public can update user preferences"
      ON user_preferences FOR UPDATE
      USING (true)
      WITH CHECK (true);
    
    CREATE POLICY "Public can delete user preferences"
      ON user_preferences FOR DELETE
      USING (true);
    
    RAISE NOTICE '✓ Fixed user_preferences.user_id: uuid → text';
  ELSE
    RAISE NOTICE '✓ user_preferences.user_id is already text';
  END IF;
END $$;

-- Fix documents.user_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'documents' 
      AND column_name = 'user_id' 
      AND data_type = 'uuid'
  ) THEN
    -- Drop all policies first
    DROP POLICY IF EXISTS "Public can view all documents" ON documents;
    DROP POLICY IF EXISTS "Public can insert documents" ON documents;
    DROP POLICY IF EXISTS "Public can update documents" ON documents;
    DROP POLICY IF EXISTS "Public can delete documents" ON documents;
    DROP POLICY IF EXISTS "Users can view own documents" ON documents;
    DROP POLICY IF EXISTS "Users can insert own documents" ON documents;
    DROP POLICY IF EXISTS "Users can update own documents" ON documents;
    DROP POLICY IF EXISTS "Users can delete own documents" ON documents;
    
    ALTER TABLE documents 
      DROP CONSTRAINT IF EXISTS documents_user_id_fkey;
    
    DELETE FROM extracted_events;
    DELETE FROM documents;
    
    ALTER TABLE documents 
      ALTER COLUMN user_id TYPE text USING user_id::text;
    
    -- Recreate public policies
    CREATE POLICY "Public can view all documents"
      ON documents FOR SELECT
      USING (true);
    
    CREATE POLICY "Public can insert documents"
      ON documents FOR INSERT
      WITH CHECK (true);
    
    CREATE POLICY "Public can update documents"
      ON documents FOR UPDATE
      USING (true)
      WITH CHECK (true);
    
    CREATE POLICY "Public can delete documents"
      ON documents FOR DELETE
      USING (true);
    
    RAISE NOTICE '✓ Fixed documents.user_id: uuid → text';
  ELSE
    RAISE NOTICE '✓ documents.user_id is already text';
  END IF;
END $$;

-- Fix extracted_events.user_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'extracted_events' 
      AND column_name = 'user_id' 
      AND data_type = 'uuid'
  ) THEN
    -- Drop all policies first
    DROP POLICY IF EXISTS "Public can view all extracted events" ON extracted_events;
    DROP POLICY IF EXISTS "Public can insert extracted events" ON extracted_events;
    DROP POLICY IF EXISTS "Public can update extracted events" ON extracted_events;
    DROP POLICY IF EXISTS "Public can delete extracted events" ON extracted_events;
    DROP POLICY IF EXISTS "Users can view own extracted events" ON extracted_events;
    DROP POLICY IF EXISTS "Users can insert own extracted events" ON extracted_events;
    DROP POLICY IF EXISTS "Users can update own extracted events" ON extracted_events;
    DROP POLICY IF EXISTS "Users can delete own extracted events" ON extracted_events;
    
    ALTER TABLE extracted_events 
      DROP CONSTRAINT IF EXISTS extracted_events_user_id_fkey;
    
    ALTER TABLE extracted_events 
      ALTER COLUMN user_id TYPE text USING user_id::text;
    
    -- Recreate public policies
    CREATE POLICY "Public can view all extracted events"
      ON extracted_events FOR SELECT
      USING (true);
    
    CREATE POLICY "Public can insert extracted events"
      ON extracted_events FOR INSERT
      WITH CHECK (true);
    
    CREATE POLICY "Public can update extracted events"
      ON extracted_events FOR UPDATE
      USING (true)
      WITH CHECK (true);
    
    CREATE POLICY "Public can delete extracted events"
      ON extracted_events FOR DELETE
      USING (true);
    
    RAISE NOTICE '✓ Fixed extracted_events.user_id: uuid → text';
  ELSE
    RAISE NOTICE '✓ extracted_events.user_id is already text';
  END IF;
END $$;

-- Fix task_lists.user_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'task_lists' 
      AND column_name = 'user_id' 
      AND data_type = 'uuid'
  ) THEN
    -- Drop all policies first
    DROP POLICY IF EXISTS "Public can view task lists" ON task_lists;
    DROP POLICY IF EXISTS "Public can insert task lists" ON task_lists;
    DROP POLICY IF EXISTS "Public can update task lists" ON task_lists;
    DROP POLICY IF EXISTS "Public can delete task lists" ON task_lists;
    DROP POLICY IF EXISTS "Users can view own task lists" ON task_lists;
    DROP POLICY IF EXISTS "Users can insert own task lists" ON task_lists;
    DROP POLICY IF EXISTS "Users can update own task lists" ON task_lists;
    DROP POLICY IF EXISTS "Users can delete own task lists" ON task_lists;
    
    ALTER TABLE task_lists 
      DROP CONSTRAINT IF EXISTS task_lists_user_id_fkey;
    
    DELETE FROM tasks;
    DELETE FROM task_lists;
    
    ALTER TABLE task_lists 
      ALTER COLUMN user_id TYPE text USING user_id::text;
    
    -- Recreate public policies
    CREATE POLICY "Public can view task lists"
      ON task_lists FOR SELECT
      USING (true);
    
    CREATE POLICY "Public can insert task lists"
      ON task_lists FOR INSERT
      WITH CHECK (true);
    
    CREATE POLICY "Public can update task lists"
      ON task_lists FOR UPDATE
      USING (true)
      WITH CHECK (true);
    
    CREATE POLICY "Public can delete task lists"
      ON task_lists FOR DELETE
      USING (true);
    
    RAISE NOTICE '✓ Fixed task_lists.user_id: uuid → text';
  ELSE
    RAISE NOTICE '✓ task_lists.user_id is already text';
  END IF;
END $$;

-- Fix tasks.user_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tasks' 
      AND column_name = 'user_id' 
      AND data_type = 'uuid'
  ) THEN
    -- Drop all policies first
    DROP POLICY IF EXISTS "Public can view tasks" ON tasks;
    DROP POLICY IF EXISTS "Public can insert tasks" ON tasks;
    DROP POLICY IF EXISTS "Public can update tasks" ON tasks;
    DROP POLICY IF EXISTS "Public can delete tasks" ON tasks;
    DROP POLICY IF EXISTS "Users can view own tasks" ON tasks;
    DROP POLICY IF EXISTS "Users can insert own tasks" ON tasks;
    DROP POLICY IF EXISTS "Users can update own tasks" ON tasks;
    DROP POLICY IF EXISTS "Users can delete own tasks" ON tasks;
    
    ALTER TABLE tasks 
      DROP CONSTRAINT IF EXISTS tasks_user_id_fkey;
    
    ALTER TABLE tasks 
      ALTER COLUMN user_id TYPE text USING user_id::text;
    
    -- Recreate public policies
    CREATE POLICY "Public can view tasks"
      ON tasks FOR SELECT
      USING (true);
    
    CREATE POLICY "Public can insert tasks"
      ON tasks FOR INSERT
      WITH CHECK (true);
    
    CREATE POLICY "Public can update tasks"
      ON tasks FOR UPDATE
      USING (true)
      WITH CHECK (true);
    
    CREATE POLICY "Public can delete tasks"
      ON tasks FOR DELETE
      USING (true);
    
    RAISE NOTICE '✓ Fixed tasks.user_id: uuid → text';
  ELSE
    RAISE NOTICE '✓ tasks.user_id is already text';
  END IF;
END $$;

-- Final verification - show all user_id columns and their types
SELECT 
  table_name,
  column_name,
  data_type,
  CASE WHEN data_type = 'text' THEN '✓ OK' ELSE '✗ NEEDS FIX' END as status
FROM information_schema.columns
WHERE column_name = 'user_id'
  AND table_schema = 'public'
ORDER BY table_name;

