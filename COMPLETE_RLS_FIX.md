# 🔧 Complete Upload Error Fix - Comprehensive Troubleshooting

Your error: **"new row violates row-level security policy"**

This means RLS (Row Level Security) is still blocking database inserts. Let me help you fix it completely.

---

## SOLUTION 1: Complete RLS Disabling (Recommended)

Run this SQL in Supabase to disable RLS on ALL tables at once:

```sql
-- Disable RLS on all tables
DO $$ 
DECLARE 
  table_name text;
BEGIN
  FOR table_name IN 
    SELECT t.tablename 
    FROM pg_tables t
    WHERE t.schemaname = 'public'
  LOOP
    EXECUTE 'ALTER TABLE "' || table_name || '" DISABLE ROW LEVEL SECURITY';
    RAISE NOTICE 'Disabled RLS on table: %', table_name;
  END LOOP;
END $$;

-- Also drop all RLS policies
DO $$
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || policy_record.policyname || '" ON "' || policy_record.tablename || '"';
    RAISE NOTICE 'Dropped policy: % on %', policy_record.policyname, policy_record.tablename;
  END LOOP;
END $$;
```

### Steps:
1. Go to https://app.supabase.com
2. Open **SQL Editor** → **+ New Query**
3. **Copy the SQL above**
4. **Run it**
5. **Wait** for "NOTICE" messages to show all tables being processed
6. **Refresh browser** hard: `Ctrl + Shift + R`
7. **Try upload again**

---

## SOLUTION 2: If Solution 1 Doesn't Work

Run these individual SQL statements one by one:

```sql
-- Disable RLS on specific tables
ALTER TABLE documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys DISABLE ROW LEVEL SECURITY;
ALTER TABLE image_uploads DISABLE ROW LEVEL SECURITY;
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE task_lists DISABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events DISABLE ROW LEVEL SECURITY;
```

---

## SOLUTION 3: Check If RLS is Actually Disabled

Run this query to verify RLS status:

```sql
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

Look for the output - the `rowsecurity` column should show `false` for all tables.

---

## SOLUTION 4: If RLS Keeps Appearing

The policies might be recreated automatically. Run this to completely remove them:

```sql
-- Drop ALL policies from ALL tables
DROP POLICY IF EXISTS "Users can read own documents" ON documents;
DROP POLICY IF EXISTS "Users can insert own documents" ON documents;
DROP POLICY IF EXISTS "Users can update own documents" ON documents;
DROP POLICY IF EXISTS "Users can delete own documents" ON documents;

DROP POLICY IF EXISTS "Users can read own extracted events" ON extracted_events;
DROP POLICY IF EXISTS "Users can insert own extracted events" ON extracted_events;
DROP POLICY IF EXISTS "Users can update own extracted events" ON extracted_events;
DROP POLICY IF EXISTS "Users can delete own extracted events" ON extracted_events;

DROP POLICY IF EXISTS "Users can read own API keys" ON api_keys;
DROP POLICY IF EXISTS "Users can insert own API keys" ON api_keys;
DROP POLICY IF EXISTS "Users can update own API keys" ON api_keys;
DROP POLICY IF EXISTS "Users can delete own API keys" ON api_keys;

DROP POLICY IF EXISTS "Users can view own images" ON image_uploads;
DROP POLICY IF EXISTS "Users can insert own images" ON image_uploads;
DROP POLICY IF EXISTS "Users can delete own images" ON image_uploads;

-- Then disable RLS
ALTER TABLE documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys DISABLE ROW LEVEL SECURITY;
ALTER TABLE image_uploads DISABLE ROW LEVEL SECURITY;
```

---

## Steps to Complete Fix:

1. **Run Solution 1 SQL** in Supabase
2. **Wait 2 seconds**
3. **Hard refresh browser**: `Ctrl + Shift + R`
4. **Wait 3 seconds**
5. **Try uploading**
6. **If error persists**, run **Solution 2** and repeat steps 2-5
7. **If error still persists**, run **Solution 4**

---

## Verification Checklist:

- [ ] Ran SQL in Supabase successfully
- [ ] Saw "Success" message
- [ ] Hard refreshed browser (Ctrl+Shift+R)
- [ ] Waited at least 3 seconds
- [ ] Tried uploading again
- [ ] Check console error (should be gone or different error)

---

## Expected Result After Fix:

✅ No more "row-level security policy" errors
✅ Upload should proceed
✅ File should appear in list
✅ Processing should start

---

## If Upload Still Fails:

Tell me the exact new error message and I'll help you fix it. The error might be different now:
- Storage bucket permission issue
- File size too large
- Invalid file type
- Other database constraint

---

## Quick Reference

**Problem**: RLS blocking inserts
**Solution**: Disable RLS on tables
**Test**: Try uploading file
**Verify**: Check console for new errors

---

**After you run the SQL and test, let me know if it works or what new error you get!** 🚀
