-- Create pending_account_creations table for tracking account creation flow
CREATE TABLE IF NOT EXISTS pending_account_creations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'awaiting_email_password',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for quick lookup by phone
CREATE INDEX IF NOT EXISTS idx_pending_phone ON pending_account_creations(phone);

-- Create index for status lookup
CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_account_creations(status);

-- Enable RLS if needed (optional)
ALTER TABLE pending_account_creations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow service role" ON pending_account_creations;

-- Create policy for service role (needed by webhook)
CREATE POLICY "Allow service role" ON pending_account_creations
  FOR ALL USING (true)
  WITH CHECK (true);
