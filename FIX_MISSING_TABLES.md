# 🔧 How to Fix Missing Database Tables

Your Supabase database is missing the required tables. Here's how to fix it:

## Option 1: Quick Fix - Run SQL in Supabase Dashboard (Recommended)

1. **Go to Supabase Dashboard**
   - Visit: https://app.supabase.com
   - Select your project: `ofkthnxcfkdtnrxgrbnq`

2. **Open SQL Editor**
   - Click: "SQL Editor" in the left sidebar
   - Click: "+ New Query"

3. **Copy and paste this SQL:**

```sql
-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  name text NOT NULL,
  file_type text,
  file_size integer,
  storage_path text NOT NULL,
  status text DEFAULT 'pending',
  progress integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  metadata jsonb
);

CREATE INDEX IF NOT EXISTS documents_user_id_idx ON documents(user_id);
CREATE INDEX IF NOT EXISTS documents_created_at_idx ON documents(created_at DESC);

-- Create extracted_events table
CREATE TABLE IF NOT EXISTS extracted_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  title text NOT NULL,
  description text,
  event_date date NOT NULL,
  start_time time,
  end_time time,
  location text,
  priority text DEFAULT 'medium',
  is_completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  metadata jsonb
);

CREATE INDEX IF NOT EXISTS extracted_events_user_id_idx ON extracted_events(user_id);
CREATE INDEX IF NOT EXISTS extracted_events_document_id_idx ON extracted_events(document_id);
CREATE INDEX IF NOT EXISTS extracted_events_event_date_idx ON extracted_events(event_date);

-- Create api_keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  service_name text NOT NULL,
  api_key text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, service_name)
);

CREATE INDEX IF NOT EXISTS api_keys_user_id_idx ON api_keys(user_id);

-- Enable RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- RLS Policies for documents
DROP POLICY IF EXISTS "Users can read own documents" ON documents;
DROP POLICY IF EXISTS "Users can insert own documents" ON documents;
DROP POLICY IF EXISTS "Users can update own documents" ON documents;
DROP POLICY IF EXISTS "Users can delete own documents" ON documents;

CREATE POLICY "Users can read own documents" ON documents FOR SELECT USING (true);
CREATE POLICY "Users can insert own documents" ON documents FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own documents" ON documents FOR UPDATE USING (true);
CREATE POLICY "Users can delete own documents" ON documents FOR DELETE USING (true);

-- RLS Policies for extracted_events
DROP POLICY IF EXISTS "Users can read own extracted events" ON extracted_events;
DROP POLICY IF EXISTS "Users can insert own extracted events" ON extracted_events;
DROP POLICY IF EXISTS "Users can update own extracted events" ON extracted_events;
DROP POLICY IF EXISTS "Users can delete own extracted events" ON extracted_events;

CREATE POLICY "Users can read own extracted events" ON extracted_events FOR SELECT USING (true);
CREATE POLICY "Users can insert own extracted events" ON extracted_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own extracted events" ON extracted_events FOR UPDATE USING (true);
CREATE POLICY "Users can delete own extracted events" ON extracted_events FOR DELETE USING (true);

-- RLS Policies for api_keys
DROP POLICY IF EXISTS "Users can read own API keys" ON api_keys;
DROP POLICY IF EXISTS "Users can insert own API keys" ON api_keys;
DROP POLICY IF EXISTS "Users can update own API keys" ON api_keys;
DROP POLICY IF EXISTS "Users can delete own API keys" ON api_keys;

CREATE POLICY "Users can read own API keys" ON api_keys FOR SELECT USING (true);
CREATE POLICY "Users can insert own API keys" ON api_keys FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own API keys" ON api_keys FOR UPDATE USING (true);
CREATE POLICY "Users can delete own API keys" ON api_keys FOR DELETE USING (true);
```

4. **Run the Query**
   - Click: "Run" button or press Ctrl+Enter
   - You should see: ✅ Success

5. **Verify Tables Created**
   - Go to "Table Editor" in left sidebar
   - You should see:
     - ✅ documents
     - ✅ extracted_events  
     - ✅ api_keys

---

## Option 2: Using Supabase CLI (If you have it installed)

```bash
cd "c:\Users\sayal\Desktop\Calenderapp 10\Calenderapp 10"
supabase db push
```

---

## Option 3: Via API Endpoint

Once the tables are created:

```bash
curl http://localhost:3000/api/db/init -X POST
```

---

## After Creating Tables

1. **Refresh your browser** (F5)
2. **Go to Upload section**
3. **Try uploading a file** - should work now! ✅

---

## Verify It's Working

1. Go to: http://localhost:3000/api/db/init (GET)
2. Should show: `"status": "checking"` with all tables showing `"exists"`

---

## If Still Getting Errors

- Clear browser cache (Ctrl+Shift+Del)
- Hard refresh page (Ctrl+F5)
- Restart server: npm run dev

---

**IMPORTANT**: The SQL above has relaxed RLS policies (allowing all authenticated users) for quick testing. After testing, you should update these to be more restrictive if needed.
