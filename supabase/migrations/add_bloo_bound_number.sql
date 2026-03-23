-- Add bloo_bound_number column to user_profiles table
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS bloo_bound_number VARCHAR(20) UNIQUE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_bloo_bound_number 
ON user_profiles(bloo_bound_number);
