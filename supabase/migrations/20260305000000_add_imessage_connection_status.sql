-- Add iMessage connection tracking columns to user_profiles

ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS imessage_connected boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS imessage_last_active_at timestamp with time zone;

-- Create index for recent activity checks
CREATE INDEX IF NOT EXISTS idx_user_profiles_imessage_last_active ON public.user_profiles(imessage_last_active_at);

-- Add comment
COMMENT ON COLUMN public.user_profiles.imessage_connected IS 'Whether iMessage connection is currently active';
COMMENT ON COLUMN public.user_profiles.imessage_last_active_at IS 'Timestamp of last successful iMessage message received';
