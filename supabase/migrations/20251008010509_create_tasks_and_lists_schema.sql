/*
  # Create Tasks and Task Lists Schema

  ## Summary
  Creates a comprehensive task management system with support for multiple lists,
  task organization, and Material Design-inspired UI features.

  ## New Tables

  ### task_lists
  Manages user-created task lists with customization options
  - id (uuid, primary key) - Unique list identifier
  - user_id (uuid) - Reference to auth.users
  - name (text) - List name
  - color (text) - List color for visual identification
  - is_visible (boolean) - Whether list is shown in the UI
  - position (integer) - Order position for display
  - created_at (timestamptz) - List creation timestamp
  - updated_at (timestamptz) - Last update timestamp

  ### tasks
  Stores individual task items with rich metadata
  - id (uuid, primary key) - Unique task identifier
  - user_id (uuid) - Reference to auth.users
  - list_id (uuid) - Reference to task_lists
  - title (text) - Task title
  - notes (text) - Detailed notes (optional)
  - due_date (date) - Due date (optional)
  - is_completed (boolean) - Completion status
  - is_starred (boolean) - Starred/pinned status
  - position (integer) - Order within list
  - created_at (timestamptz) - Task creation timestamp
  - updated_at (timestamptz) - Last update timestamp

  ## Security
  - Enable RLS on both tables
  - Users can only access their own lists and tasks
  - Separate policies for SELECT, INSERT, UPDATE, DELETE operations
*/

-- Create task_lists table
CREATE TABLE IF NOT EXISTS task_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  is_visible boolean DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_lists_user_id ON task_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_task_lists_position ON task_lists(position);

ALTER TABLE task_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own task lists"
  ON task_lists FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own task lists"
  ON task_lists FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own task lists"
  ON task_lists FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own task lists"
  ON task_lists FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  list_id uuid REFERENCES task_lists(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  notes text DEFAULT '',
  due_date date,
  is_completed boolean DEFAULT false,
  is_starred boolean DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_list_id ON tasks(list_id);
CREATE INDEX IF NOT EXISTS idx_tasks_is_completed ON tasks(is_completed);
CREATE INDEX IF NOT EXISTS idx_tasks_is_starred ON tasks(is_starred);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_position ON tasks(position);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tasks"
  ON tasks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tasks"
  ON tasks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tasks"
  ON tasks FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own tasks"
  ON tasks FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create trigger function for updating updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers
DROP TRIGGER IF EXISTS update_task_lists_updated_at ON task_lists;
CREATE TRIGGER update_task_lists_updated_at
  BEFORE UPDATE ON task_lists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
