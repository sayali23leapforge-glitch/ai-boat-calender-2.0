# Quick Fix: Task Creation Not Working

## The Problem
Task creation is failing or creating lists instead. Error: "Could not find the 'list_id' column"

## The Solution (5 Steps)

### Step 1: Go to Supabase
Open: https://app.supabase.com

### Step 2: Select Your Project
Click on your Calendar App project

### Step 3: Open SQL Editor  
On the left sidebar, click **SQL Editor**

### Step 4: Paste & Run
Copy this and paste into a new SQL query:

```sql
-- Create task_lists table
CREATE TABLE IF NOT EXISTS task_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#3b82f6',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_lists_user_id ON task_lists(user_id);
ALTER TABLE task_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own task lists" ON task_lists FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own task lists" ON task_lists FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own task lists" ON task_lists FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own task lists" ON task_lists FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Create tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  list_id uuid REFERENCES task_lists(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  notes text DEFAULT '',
  due_date date,
  due_time time without time zone,
  is_completed boolean DEFAULT false,
  is_starred boolean DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  priority text NOT NULL DEFAULT 'medium',
  estimated_hours numeric,
  progress integer DEFAULT 0,
  goal text,
  location text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_list_id ON tasks(list_id);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tasks" ON tasks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tasks" ON tasks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tasks" ON tasks FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own tasks" ON tasks FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Create triggers
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE 'plpgsql';

DROP TRIGGER IF EXISTS update_task_lists_updated_at ON task_lists;
CREATE TRIGGER update_task_lists_updated_at BEFORE UPDATE ON task_lists FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Step 5: Click Run
Click the big blue **Run** button

## ✅ Done!
- Refresh your browser
- Try creating a task again
- It should work now!

## Still Having Issues?
See [TASK_CREATION_NOT_WORKING.md](TASK_CREATION_NOT_WORKING.md) for more detailed information.
