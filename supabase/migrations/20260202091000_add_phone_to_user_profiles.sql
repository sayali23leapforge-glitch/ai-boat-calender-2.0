-- Add phone column to existing user_profiles table for iMessage mapping
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS phone text UNIQUE;

CREATE INDEX IF NOT EXISTS idx_user_profiles_phone ON public.user_profiles(phone);
