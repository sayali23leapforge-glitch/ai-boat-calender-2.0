-- Remove UNIQUE constraint from bloo_bound_number (can be shared by multiple users)
ALTER TABLE user_profiles
DROP CONSTRAINT IF EXISTS user_profiles_bloo_bound_number_key;

-- Ensure phone column has UNIQUE constraint (each user has unique iMessage number)
ALTER TABLE user_profiles
DROP CONSTRAINT IF EXISTS user_profiles_phone_key;

ALTER TABLE user_profiles
ADD CONSTRAINT user_profiles_phone_key UNIQUE (phone);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_phone 
ON user_profiles(phone);

CREATE INDEX IF NOT EXISTS idx_user_profiles_bloo_bound_number 
ON user_profiles(bloo_bound_number);
