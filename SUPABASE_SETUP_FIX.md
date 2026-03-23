# ⚠️ Supabase Service Role Key Issue

## Problem
The API endpoints are returning 500 errors because the `SUPABASE_SERVICE_ROLE_KEY` is from the OLD Supabase project (vvminzmrytzujvwritfv), not the NEW one (xaalmrwyzmhfectaeqmd).

## Current Status
- ✅ `NEXT_PUBLIC_SUPABASE_URL` = https://xaalmrwyzmhfectaeqmd.supabase.co (NEW)
- ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY` = sb_publishable_40wMwJ9TF3ItRWojp-xu_Q_LF_ZWERQ (NEW)
- ❌ `SUPABASE_SERVICE_ROLE_KEY` = OLD project key (needs update)

## How to Fix

### Step 1: Go to Supabase Dashboard
1. Open https://app.supabase.com
2. Select the project: **xaalmrwyzmhfectaeqmd** (your new Calendar AI project)

### Step 2: Get Service Role Key
1. Click **Settings** (bottom left)
2. Click **API** tab
3. Copy the **Service Role** key (starts with `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhhYWxtcnd5em1oZmVjdGFlcW1kI...`)
   - It will be a long JWT token
   - Make sure it contains "ref":"xaalmrwyzmhfectaeqmd" (not vvminzmrytzujvwritfv)

### Step 3: Update .env.local
Replace the old key with the new one:
```
SUPABASE_SERVICE_ROLE_KEY=<YOUR_NEW_SERVICE_ROLE_KEY>
```

### Step 4: Restart Dev Server
```bash
# Stop the current server (Ctrl+C)
# Then restart:
npm run dev
```

## Verify
After updating, check the terminal output should show:
- ✅ GET /api/task-lists/get 200 (not 500)
- ✅ GET /api/tasks/get 200 (not 500)
- ✅ GET /api/calendar/get 200 (not 500)

Then try creating an event in the chat - it should work!
