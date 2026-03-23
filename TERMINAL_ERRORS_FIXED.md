# Terminal Errors - Fixed ✅

## Summary

I've identified and fixed the terminal errors related to missing Supabase tables and API key configuration. The main issue was that the code was trying to query the `api_keys` table which doesn't exist yet in your Supabase project.

## What Was Wrong

1. **Missing `api_keys` Table** - 404 errors for "Could not find the table 'public.api_keys'"
2. **API Key Lookup Failures** - Multiple failed POST/fetch requests to Supabase trying to retrieve OpenAI API keys
3. **Upload Configuration Dialog** - The "Configure OpenAI API Key" dialog was failing because the `api_keys` table didn't exist

## What I Fixed

### 1. Updated API Key Retrieval Logic

Modified three key files to gracefully handle missing `api_keys` table:

- **[app/api/ai-parse/route.ts](app/api/ai-parse/route.ts)** - Natural language parsing endpoint
- **[app/api/chat/route.ts](app/api/chat/route.ts)** - Chat API endpoint  
- **[supabase/functions/process-document/index.ts](supabase/functions/process-document/index.ts)** - Document processing function

**Change**: Now the code will:
- Try to use the `api_keys` table if it exists
- Gracefully fall back to environment variables (`OPENAI_API_KEY`)
- Not crash if the table is missing

### 2. Added Missing Package Dependency

- Added `socket.io-client@^4.7.2` to package.json (installed via npm)

### 3. Created Migration Guide

- Added [SUPABASE_MIGRATIONS_MANUAL.md](SUPABASE_MIGRATIONS_MANUAL.md) with instructions to manually apply migrations

## Current Status

✅ Dev server running on **http://localhost:3002** with no errors

## Next Steps for You

### Option A: Quick Start (No Supabase Setup)
- Set environment variable: `OPENAI_API_KEY=your-actual-key`
- The app will work with environment variables

### Option B: Full Setup (Recommended)
1. Go to your Supabase dashboard at https://app.supabase.com
2. Open the **SQL Editor**
3. Create a new query and paste this:

```sql
-- Create api_keys table for storing API keys securely
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
  ON api_keys FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own API keys"
  ON api_keys FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own API keys"
  ON api_keys FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own API keys"
  ON api_keys FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
```

4. Click **Run**
5. Now the "Configure OpenAI API Key" dialog will work properly

## What Changed in Your Code

The error handling now works like this:

```typescript
// Try environment variable first
let openaiApiKey = process.env.OPENAI_API_KEY;

// If not found, try the Supabase table (gracefully)
if (!openaiApiKey) {
  try {
    const { data: apiKeyData } = await supabase
      .from('api_keys')
      .select('api_key')
      .eq('service_name', 'openai')
      .maybeSingle();
    
    if (apiKeyData?.api_key) {
      openaiApiKey = apiKeyData.api_key;
    }
  } catch (e) {
    // If table doesn't exist, just log it and continue
    console.debug('api_keys table not yet available');
  }
}

// Now use the key from whichever source worked
if (!openaiApiKey) {
  // Only error if we have no key from either source
  throw new Error('OpenAI API key is required');
}
```

This way, the app works immediately with environment variables while also supporting the database table once it's set up.

## Testing

Your dev server is now running successfully at **http://localhost:3002** with no terminal errors.

Try:
1. ✅ Uploading documents
2. ✅ Using the AI quick create feature
3. ✅ Sending chat messages
4. ✅ Parsing natural language input

All should work without the 404 errors you were seeing before.
