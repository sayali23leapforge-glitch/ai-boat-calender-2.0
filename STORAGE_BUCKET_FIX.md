# Storage Bucket Initialization Guide

## Problem
When uploading documents or images, you may see an error: **"Bucket not found"**

This happens because Supabase storage buckets (`documents` and `images`) haven't been created yet.

## Solution

### Automatic Initialization (Recommended)

The app now automatically initializes storage buckets when you:
1. **Load the app** - The Document Upload component calls `/api/storage/init-bucket` on mount
2. **Open the Upload section** - Storage buckets are created if they don't exist
3. **First upload** - If buckets aren't created by then, the upload will fail with a clear error message

### Manual Initialization

If automatic initialization doesn't work, you can manually initialize buckets:

**Method 1: Via API Endpoint**
```bash
# Check bucket status
curl http://localhost:3000/api/storage/init-bucket

# Create missing buckets
curl -X POST http://localhost:3000/api/storage/init-bucket
```

**Method 2: Health Check**
```bash
# Check system health including bucket status
curl http://localhost:3000/api/health/check
```

**Method 3: Supabase Dashboard**
1. Go to your Supabase project
2. Navigate to **Storage** → **Buckets**
3. Create a new bucket named `documents`
   - Set as **Public**
   - File size limit: **50MB**
4. Create another bucket named `images`
   - Set as **Public**
   - File size limit: **50MB**

## Bucket Specifications

### Documents Bucket (`documents`)
- **Public**: Yes
- **File Size Limit**: 50MB (52428800 bytes)
- **Allowed MIME Types**:
  - application/pdf
  - application/msword
  - application/vnd.openxmlformats-officedocument.wordprocessingml.document
  - application/vnd.ms-excel
  - application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
  - text/plain
  - image/png
  - image/jpeg
  - image/jpg
  - image/gif

### Images Bucket (`images`)
- **Public**: Yes
- **File Size Limit**: 50MB (52428800 bytes)
- **Allowed MIME Types**:
  - image/png
  - image/jpeg
  - image/jpg
  - image/gif
  - image/webp
  - image/bmp

## Troubleshooting

### Buckets Still Not Working?

1. **Verify Environment Variables**
   - Check `.env.local` has `SUPABASE_SERVICE_ROLE_KEY`
   - Check `NEXT_PUBLIC_SUPABASE_URL` is correct

2. **Check Supabase Connection**
   - Verify you have the correct Supabase project
   - Ensure your service role key has storage permissions

3. **Check Dev Server Logs**
   - Look for any errors during app startup
   - Check browser console for error messages

4. **Reset & Retry**
   - Delete buckets manually from Supabase dashboard
   - Restart the dev server with `npm run dev`
   - Visit `/api/storage/init-bucket` to reinitialize

### "Failed to list buckets" Error

This means the service role key is invalid or doesn't have storage permissions.

**Solution:**
1. Go to Supabase project settings
2. Get a new service role key if needed
3. Update `.env.local` with the correct key
4. Restart the dev server

## Files Modified

- `app/api/storage/init-bucket/route.ts` - Storage bucket initialization endpoint
- `app/api/health/check/route.ts` - System health check endpoint
- `components/document-upload.tsx` - Calls bucket initialization on mount
- `lib/document-processor.ts` - Better error messages for bucket issues

## How It Works

```
User Loads App
    ↓
Document Upload Component Mounts
    ↓
Calls /api/storage/init-bucket (POST)
    ↓
Check if buckets exist
    ↓
Create missing buckets with proper configuration
    ↓
Return status (created or already exists)
    ↓
User can now upload documents and images
```

## Testing

To verify buckets are initialized:

1. **Option 1: Check Health**
   ```bash
   curl http://localhost:3000/api/health/check | jq '.results'
   ```
   Look for: `"documentsBucket": { "status": "exists" }`

2. **Option 2: Try Upload**
   - Go to Upload section
   - Try uploading a file
   - Should work without "Bucket not found" error

3. **Option 3: Supabase Dashboard**
   - Go to Storage → Buckets
   - Should see `documents` and `images` buckets

## Prevention

The app will automatically maintain these buckets. If you delete them manually, they'll be automatically recreated the next time the app loads.
