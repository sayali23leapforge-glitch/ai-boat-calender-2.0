/*
  # Adaptive reminder engine

  Adds:
  - user_profiles.reminder_prefs for adaptive model preferences
  - reminders queue table for scheduled email reminders
*/

ALTER TABLE IF EXISTS user_profiles
  ADD COLUMN IF NOT EXISTS reminder_prefs text DEFAULT '';

CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  task_id uuid NOT NULL,
  scheduled_at timestamptz NOT NULL,
  channel text NOT NULL DEFAULT 'GMAIL',
  status text NOT NULL DEFAULT 'PENDING',
  importance_level integer NOT NULL DEFAULT 1,
  template text,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reminders_channel_check CHECK (channel IN ('GMAIL')),
  CONSTRAINT reminders_status_check CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'CANCELED')),
  CONSTRAINT reminders_importance_check CHECK (importance_level BETWEEN 1 AND 3)
);

CREATE INDEX IF NOT EXISTS idx_reminders_status_scheduled_at
  ON reminders(status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_reminders_user_id
  ON reminders(user_id);

CREATE INDEX IF NOT EXISTS idx_reminders_task_id
  ON reminders(task_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reminders_dedup
  ON reminders(task_id, channel, template, scheduled_at);

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own reminders" ON reminders;
CREATE POLICY "Users can view own reminders"
  ON reminders
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own reminders" ON reminders;
CREATE POLICY "Users can insert own reminders"
  ON reminders
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own reminders" ON reminders;
CREATE POLICY "Users can update own reminders"
  ON reminders
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own reminders" ON reminders;
CREATE POLICY "Users can delete own reminders"
  ON reminders
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DO $$
BEGIN
  IF to_regprocedure('update_updated_at_column()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS update_reminders_updated_at ON reminders;
    CREATE TRIGGER update_reminders_updated_at
      BEFORE UPDATE ON reminders
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
