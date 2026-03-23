# Manual Supabase Migrations Guide

If you're seeing "Could not find table 'public.api_keys'" errors, the migrations haven't been applied to your Supabase database yet. Follow these steps:

## Option 1: Using Supabase Dashboard (Recommended)

1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Select your project
3. Go to **SQL Editor** in the left sidebar
4. Create a new query
5. Copy and paste the content from [supabase/migrations/20251027222736_create_api_keys_table.sql](supabase/migrations/20251027222736_create_api_keys_table.sql)
6. Click **Run**

## Option 2: Using Supabase CLI

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Link your project
supabase link --project-ref <your-project-ref>

# Push migrations
supabase db push
```

## Required Tables

The following table must exist in your Supabase database:

### api_keys table
```sql
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_name text NOT NULL,
  api_key text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, service_name)
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own API keys"
  ON api_keys
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own API keys"
  ON api_keys
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own API keys"
  ON api_keys
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own API keys"
  ON api_keys
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
```

## Workaround

In the meantime, you can use environment variables:
- `OPENAI_API_KEY` - For OpenAI API access

The app will automatically fall back to environment variables if the `api_keys` table doesn't exist.
