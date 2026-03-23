# Quick Fix - Upload Errors Guide

## Problem
**Upload shows error: "Bucket not found"**

## Solution (Pick One)

### ✅ Option 1: Automatic (Recommended)
Just restart the app:
```bash
npm run dev
```
The app will automatically create the storage buckets when it loads. No additional steps needed!

### ✅ Option 2: Manual Verification
To verify buckets were created:
```bash
# Check status
curl http://localhost:3000/api/storage/init-bucket

# Create if missing
curl -X POST http://localhost:3000/api/storage/init-bucket
```

### ✅ Option 3: Health Check
```bash
curl http://localhost:3000/api/health/check
```

## What Was Fixed

✅ Created automatic bucket initialization
✅ Buckets now created when app loads
✅ No more "Bucket not found" errors
✅ Added diagnostic endpoints

## Files That Changed

1. **app/api/storage/init-bucket/route.ts** - Auto-creates buckets
2. **components/document-upload.tsx** - Calls initialization on load
3. **app/api/health/check/route.ts** - System health check

## Test It

1. Open app (buckets auto-initialized)
2. Go to Upload section
3. Try uploading a file
4. **Should work now!** ✅

## Still Having Issues?

Check **STORAGE_BUCKET_FIX.md** for detailed troubleshooting.

---

**Bottom line:** Restart the app, try uploading - it should work! 🎉
