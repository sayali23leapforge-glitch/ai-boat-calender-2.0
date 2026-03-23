# 🔧 Upload Error Troubleshooting Flowchart

## Start Here: "I'm getting upload errors"

```
                                Is the app running?
                                    ↙️     ↘️
                                  YES      NO
                                  ↓        ↓
                                 Q2       Run: npm run dev
                              ↙ ↓ ↘       Then go to Q2
        
        Q2: Can you access the app?
                ↙️          ↘️
              YES           NO
              ↓             ↓
             Q3          Check:
                         - Is npm run dev complete? (wait 3-5 seconds)
                         - Is port 3000 free?
                         - Is there a firewall blocking?
                         - Try: taskkill /F /IM node.exe
                         - Then: npm run dev again

        Q3: Can you see the Upload section?
                ↙️          ↘️
              YES           NO
              ↓             ↓
             Q4          Check:
                         - Open browser console (F12)
                         - Look for JavaScript errors
                         - See README_UPLOADS_FIXED.md

        Q4: Can you see file upload button?
                ↙️          ↘️
              YES           NO
              ↓             ↓
             Q5          This shouldn't happen
                         Check STORAGE_BUCKET_FIX.md
                         "Component won't load" section

        Q5: Try to upload a file. What happens?
         ↙️      ↓      ↓      ↓      ↘️
        A        B      C      D        E
        ↓        ↓      ↓      ↓        ↓
      Works!   Error: Browser  Upload  Strange
       ↓        "Bucket freezes  seems  error
       ✅       not found"              to hang   message
       
       Done!    ↓                ↓        ↓
                Q6              Q7       Q8

Q6: "Bucket not found" error
    ↙️                           ↘️
 Recent                        First
 upload?                        time?
  ↓                             ↓
  Clear                        Check:
  browser                      - Restart app
  cache                        - Wait 5 seconds
  (Ctrl+Shift+Del)             - Try again
  Refresh page
  Try again

  Still fails?
  ↓
  Open: http://localhost:3000/api/health/check
  ↓
  Look at response:
  - If "documentsBucket": "exists" → Something else wrong
  - If "documentsBucket": missing → Reinitialize:
    $ curl -X POST http://localhost:3000/api/storage/init-bucket
    Then try upload again

Q7: Browser freezes
    ↓
    Check:
    - Is there a lot of data to process?
    - Is the file very large?
    - Are other processes using CPU?
    ↓
    Solution:
    - Try smaller file first
    - Close other apps
    - Restart app and try again
    ↓
    Still freezing?
    → See STORAGE_BUCKET_FIX.md "Browser Freezes" section

Q8: Unexpected error message
    ↓
    Copy the exact error message
    ↓
    Open browser console (F12)
    ↓
    Look for related errors
    ↓
    Search STORAGE_BUCKET_FIX.md for that error
    ↓
    Follow recommended solution
    ↓
    If not found → See "Custom Errors" section
```

## Quick Decision Tree

### "I'm seeing an error"

| Error Message | Solution |
|---------------|----------|
| `Bucket not found` | Restart app, wait 3 sec, try again |
| `Failed to upload` | Check file size (must be <50MB) |
| `Network error` | Check internet connection |
| `Permission denied` | Check SUPABASE_SERVICE_ROLE_KEY in .env.local |
| `Cannot read property` | Clear cache, restart browser |
| `401 Unauthorized` | Check authentication, try logging in again |

### "I'm not sure what's wrong"

Run this command:
```bash
curl http://localhost:3000/api/health/check
```

Then check:
```
✅ If "status": "healthy" 
   → Problem is elsewhere, see STORAGE_BUCKET_FIX.md

❌ If "status": "degraded"
   → Read the "results" section, follow recommendations

❌ If endpoint doesn't respond
   → App not running, do: npm run dev
```

## Common Issues → Quick Fixes

### Issue 1: "Bucket not found" (Most Common)
```
What to try:
1. npm run dev (restart)
2. Wait 3-5 seconds
3. Try upload again
4. If still fails: curl -X POST http://localhost:3000/api/storage/init-bucket
```

### Issue 2: "Cannot upload large files"
```
What to try:
1. File must be under 50MB
2. Try with smaller file first
3. If that works → your file is too large
4. Compress file and try again
```

### Issue 3: "Upload starts but never finishes"
```
What to try:
1. Check browser console for errors
2. Close other browser tabs
3. Restart browser
4. Try smaller file
5. Check internet connection
```

### Issue 4: "Upload button doesn't appear"
```
What to try:
1. Refresh page (F5)
2. Check browser console (F12)
3. Look for JavaScript errors
4. Restart app: npm run dev
5. Check STORAGE_BUCKET_FIX.md for component issues
```

### Issue 5: "Got an error I don't recognize"
```
What to try:
1. Copy the exact error message
2. Search in STORAGE_BUCKET_FIX.md
3. If not found, check browser console
4. Look for related errors
5. Try common fixes: restart, clear cache, refresh
```

## When To Check Each Document

| Situation | Document |
|-----------|----------|
| Quick fix needed | `QUICK_FIX_UPLOADS.md` |
| First time user | `README_UPLOADS_FIXED.md` |
| Specific error | `STORAGE_BUCKET_FIX.md` |
| Want details | `UPLOAD_FIX_COMPLETE.md` |
| Technical deep-dive | `UPLOAD_FIX_COMPLETE.md` |
| Verifying fix | `VERIFICATION_CHECKLIST.md` |

## Decision Matrix

```
          Upload fails?
              ↙️  ↘️
            YES   NO
            ↓     ↓
            A     Done!
                  App works
            Error    
            message?
            ↙️  ↘️
          YES   NO
          ↓     ↓
          B     See Q7-Q8
                above
     Has         
     "bucket"    
     in message?
     ↙️  ↘️
    YES   NO
    ↓     ↓
    C     D
   Most   Less
   common common
   Fix:    Fix:
   Restart Check
   app     file
           size
```

## Final Checklist

Before giving up, try this sequence:

- [ ] Restart app: `npm run dev`
- [ ] Wait 3-5 seconds
- [ ] Clear browser cache (Ctrl+Shift+Del)
- [ ] Refresh page (F5)
- [ ] Try small test file first
- [ ] Check health: `http://localhost:3000/api/health/check`
- [ ] Check console (F12) for errors
- [ ] Try in incognito mode (new window)
- [ ] Restart entire computer (last resort)

If still failing after all above:
→ Report exact error message and your setup to support

---

## TL;DR (Too Long; Didn't Read)

**Most uploads just work after:**
```bash
npm run dev
```

**If not:**
```bash
# Check health
curl http://localhost:3000/api/health/check

# Initialize buckets if needed
curl -X POST http://localhost:3000/api/storage/init-bucket

# Then try uploading again
```

**That fixes 99% of issues!**
