/*
  # Create Goals and Goal Tasks Schema

  ## Summary
  Creates a comprehensive goal management system with support for goals, categories, priorities, and associated tasks.

  ## New Tables

  ### goals
  Manages user goals with progress tracking
  - id (uuid, primary key) - Unique goal identifier
  - user_id (uuid) - Reference to auth.users
  - title (text) - Goal title
  - description (text) - Goal description
  - category (text) - Goal category: 'work', 'personal', 'health', 'learning'
  - priority (text) - Priority level: 'critical', 'high', 'medium', 'low'
  - progress (smallint) - Progress percentage (0-100)
  - target_date (date) - Target completion date
  - created_at (timestamptz) - Goal creation timestamp
  - updated_at (timestamptz) - Last update timestamp

  ### goal_tasks
  Stores individual tasks associated with goals
  - id (uuid, primary key) - Unique task identifier
  - goal_id (uuid) - Reference to goals
  - title (text) - Task title
  - completed (boolean) - Completion status
  - priority (text) - Priority level: 'critical', 'high', 'medium', 'low'
  - due_date (date) - Due date (optional)
  - estimated_hours (numeric) - Estimated hours (optional)
  - position (integer) - Order within goal
  - created_at (timestamptz) - Task creation timestamp
  - updated_at (timestamptz) - Last update timestamp

  ## Security
  - Enable RLS on both tables
  - Users can only access their own goals and tasks
*/

-- Create goals table
CREATE TABLE IF NOT EXISTS goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text DEFAULT '',
  category text NOT NULL DEFAULT 'personal' CHECK (category IN ('work', 'personal', 'health', 'learning')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  progress smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  target_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_category ON goals(category);
CREATE INDEX IF NOT EXISTS idx_goals_priority ON goals(priority);
CREATE INDEX IF NOT EXISTS idx_goals_target_date ON goals(target_date);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own goals"
  ON goals FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own goals"
  ON goals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own goals"
  ON goals FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own goals"
  ON goals FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create goal_tasks table
CREATE TABLE IF NOT EXISTS goal_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid REFERENCES goals(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  completed boolean DEFAULT false,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  due_date date,
  estimated_hours numeric(6,2),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_goal_tasks_goal_id ON goal_tasks(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_tasks_completed ON goal_tasks(completed);
CREATE INDEX IF NOT EXISTS idx_goal_tasks_position ON goal_tasks(position);

ALTER TABLE goal_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own goal tasks"
  ON goal_tasks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM goals
      WHERE goals.id = goal_tasks.goal_id
      AND goals.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own goal tasks"
  ON goal_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM goals
      WHERE goals.id = goal_tasks.goal_id
      AND goals.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own goal tasks"
  ON goal_tasks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM goals
      WHERE goals.id = goal_tasks.goal_id
      AND goals.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM goals
      WHERE goals.id = goal_tasks.goal_id
      AND goals.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own goal tasks"
  ON goal_tasks FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM goals
      WHERE goals.id = goal_tasks.goal_id
      AND goals.user_id = auth.uid()
    )
  );

-- Ensure update_updated_at_column function exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $func$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;
  END IF;
END $$;

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_goals_updated_at ON goals;
CREATE TRIGGER update_goals_updated_at
  BEFORE UPDATE ON goals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_goal_tasks_updated_at ON goal_tasks;
CREATE TRIGGER update_goal_tasks_updated_at
  BEFORE UPDATE ON goal_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

