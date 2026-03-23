/*
  # Add phone number to user profiles

  - Add phone column to user_profiles table
  - Phone will be used to map iMessage numbers to user accounts
*/

-- Add phone column to user_profiles if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' AND column_name = 'phone'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN phone text;
  END IF;
END $$;

-- Create index for faster phone lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_phone ON user_profiles(phone);
