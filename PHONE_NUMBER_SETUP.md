# Phone Number Integration - Setup Guide

## Overview
Phone number field has been added to the registration process. Each user account now stores a phone number that can be used to map incoming iMessage numbers to the correct user account.

## Changes Made

### 1. Database Migration
**File:** `supabase/migrations/20260129000000_add_phone_to_user_profiles.sql`

Adds a `phone` column to the `user_profiles` table with an index for faster lookups.

### 2. Frontend - Registration Form
**File:** `components/auth/email-auth-form.tsx`

- Added phone number input field (only visible during sign up)
- Added Phone icon from lucide-react
- Phone field is required during registration
- Phone number is validated (not empty)
- Consistent UI design with existing email/password fields

### 3. Backend - User Profile Creation
**File:** `components/auth/email-auth-form.tsx` (handleSubmit function)

After successful signup:
- Creates/updates user profile with phone number
- Uses `upsert` to handle potential conflicts
- Phone number is stored in `user_profiles` table linked by `user_id`

### 4. Migration Check API
**File:** `app/api/db/migrate-phone/route.ts`

API endpoint to verify the phone column exists in the database.

## Setup Instructions

### Step 1: Run Database Migration

You need to add the `phone` column to your Supabase database. Choose ONE of these methods:

#### Option A: Supabase Dashboard (Recommended)
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Run this SQL:
```sql
-- Add phone column to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS phone text;

-- Create index for faster phone lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_phone ON user_profiles(phone);
```

#### Option B: Supabase CLI
1. Make sure the migration file exists: `supabase/migrations/20260129000000_add_phone_to_user_profiles.sql`
2. Run: `supabase db push`

#### Option C: Check via API
Visit: `http://localhost:3000/api/db/migrate-phone` (POST request)
- If successful: Phone column exists
- If error: Follow the SQL instructions in the response

### Step 2: Test Registration

1. Start your dev server: `npm run dev`
2. Go to the login page
3. Click "Create account"
4. You should now see three fields:
   - Email
   - Password
   - Phone Number
5. Fill in all fields and create an account
6. The phone number will be stored in `user_profiles.phone`

### Step 3: Verify Database

Check that the phone number was saved:
```sql
SELECT user_id, phone, full_name, created_at 
FROM user_profiles 
ORDER BY created_at DESC 
LIMIT 10;
```

## Registration Flow

### Before (Old):
```
Email → Password → Create Account → User Created
```

### After (New):
```
Email → Password → Phone → Create Account → User Created + Profile with Phone
```

## Database Schema

### user_profiles table
```sql
CREATE TABLE user_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  avatar_url text,
  phone text,  -- NEW FIELD
  onboarding_complete boolean DEFAULT false,
  last_sign_in timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_user_profiles_phone ON user_profiles(phone);
```

## Future Use Case: iMessage Integration

With phone numbers stored, you can now:
1. Receive iMessage from a phone number
2. Query `user_profiles` to find which user owns that phone
3. Create tasks/events for that specific user account

Example query:
```typescript
const { data } = await supabase
  .from('user_profiles')
  .select('user_id')
  .eq('phone', incomingPhoneNumber)
  .single()

if (data) {
  // Create task for data.user_id
}
```

## Important Notes

✅ **What Changed:**
- Registration form now includes phone number field
- Phone number is stored in `user_profiles.phone`
- Phone field is required during signup

❌ **What Did NOT Change:**
- Login logic (still email + password)
- Authentication flow (still Supabase Auth)
- Session handling
- Task/goal/event creation logic
- AI/iMessage processing logic
- Any calculations or business logic

## Troubleshooting

### Issue: "Phone column does not exist" error
**Solution:** Run the migration SQL in Supabase dashboard (see Step 1)

### Issue: Registration fails with "constraint violation"
**Solution:** Make sure `user_profiles` table exists and has proper RLS policies

### Issue: Phone not showing in database
**Solution:** Check Supabase logs and verify the upsert query in `email-auth-form.tsx`

### Issue: Phone field not showing in form
**Solution:** 
1. Make sure you're on the "Create account" tab (not "Sign in")
2. Check browser console for React errors
3. Verify Phone icon is imported from lucide-react

## Testing Checklist

- [ ] Phone column exists in database
- [ ] Registration form shows phone field
- [ ] Phone field is required (can't submit without it)
- [ ] Sign up creates user profile with phone
- [ ] Login still works with just email/password
- [ ] Existing users can still log in
- [ ] Phone is searchable via `user_profiles` table

## Files Modified

1. `supabase/migrations/20260129000000_add_phone_to_user_profiles.sql` - NEW
2. `app/api/db/migrate-phone/route.ts` - NEW
3. `components/auth/email-auth-form.tsx` - MODIFIED
4. `PHONE_NUMBER_SETUP.md` - NEW (this file)

## Summary

The phone number feature is now ready! Users must provide a phone number during registration, and it will be stored in their profile for future iMessage integration.

**Next Steps:** When you're ready to implement iMessage → user mapping, query the `user_profiles.phone` column to find the correct user for incoming messages.
