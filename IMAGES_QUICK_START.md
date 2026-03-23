# Quick Start: Image Auto-Add Feature

## 🚀 In 30 Seconds

**Send image via iMessage** → **AI processes it** → **Appears in Upload section** → **Create calendar events**

## 📸 To Test

1. Open app: `http://localhost:3000`
2. Connect to iMessage (via BlueBubbles)
3. Send any image via iMessage
4. Look at Upload section → "Images" tab
5. See extracted dates and events
6. Click "Add to Calendar" to create events

## 🎯 What You'll See

**In Upload Section:**
```
┌─────────────────────────────────┐
│ Events [Active]  📷 Images (3)   │
└─────────────────────────────────┘

Each image shows:
✓ Image preview
✓ Extracted dates (blue badges)
✓ Found events with dates
✓ OCR text snippet
✓ Delete & Add buttons
```

## 🔄 The Flow

```
iMessage
  ↓ (send image)
BlueBubbles Socket
  ↓
AI Bot receives
  ↓
Claude Vision analyzes
  ↓
Extracts dates & events
  ↓
Creates calendar events
  ↓
Saves to database
  ↓
Real-time sync to UI
  ↓
Image appears in Upload section
```

## ✨ Key Features

| Feature | Status |
|---------|--------|
| Auto-detect images in iMessage | ✅ |
| Claude Vision analysis | ✅ |
| Date extraction (any format) | ✅ |
| Event extraction | ✅ |
| Auto calendar creation | ✅ |
| Display in Upload section | ✅ |
| Real-time sync | ✅ |
| Delete images | ✅ |
| Responsive UI | ✅ |

## 📊 Extracted Information

From any image, the AI extracts:

**Dates**
- Any date format recognized
- Ranges (March 15-20)
- Relative dates (Next Monday)
- Times if visible

**Events**
- Event titles
- Associated dates
- Descriptions from image
- Context from surrounding text

**Text**
- Full OCR of image
- Organized structure
- Searchable

## 🗂️ Files Structure

| File | Purpose |
|------|---------|
| `components/document-upload.tsx` | Main upload view with tabs |
| `components/image-display.tsx` | Image gallery & cards |
| `app/api/images/list/route.ts` | Fetch images API |
| `app/api/images/delete/route.ts` | Delete images API |
| `app/api/images/process/route.ts` | Process image API |
| `lib/image-processor.ts` | Claude Vision integration |
| `lib/messaging/bluebubbles-service.ts` | iMessage integration |

## 🔐 Security

✅ Images are private to you
✅ Row-level security enabled
✅ Only your data visible
✅ Delete anytime
✅ Not logged or shared

## 🐛 Troubleshooting

**Images not appearing?**
1. Check iMessage connected
2. Verify image sends successfully
3. Check browser console for errors
4. Ensure database table exists

**Events not creating?**
1. Check calendar is accessible
2. Verify dates are recognized (YYYY-MM-DD format)
3. Check API response in Network tab

**Connection issues?**
1. Verify BlueBubbles URL in .env
2. Check WebSocket connection
3. Restart dev server: `npm run dev`

## 📱 Supported Formats

✅ JPEG/JPG
✅ PNG
✅ GIF
✅ WebP
✅ BMP

## 💻 API Endpoints

```
GET  /api/images/list?userId=...
POST /api/images/process (automatic)
DELETE /api/images/delete?id=...
```

## 🎨 UI Preview

```
┌─────────────────────────────────────┐
│  Upload Section                     │
├─────────────────────────────────────┤
│ [Events]  [📷 Images (5)]           │
├─────────────────────────────────────┤
│                                     │
│  ┌──────────┐  ┌──────────┐        │
│  │ [Image]  │  │ [Image]  │        │
│  │          │  │          │        │
│  │ 📅 Feb15 │  │ 📅 Mar20 │        │
│  │ 📝 Exam  │  │ 📝 Final │        │
│  │ [Delete] │  │ [Add]    │        │
│  └──────────┘  └──────────┘        │
│                                     │
│  More images in grid...            │
│                                     │
└─────────────────────────────────────┘
```

## 🔔 Notifications

When you send an image:

**In iMessage:**
```
📸 Image Processed!

📅 Dates found: 3
  • 2026-02-15
  • 2026-03-20
  • 2026-04-10

📝 Events: 2
  • Midterm Exam - 2026-02-15
  • Final Project - 2026-04-10

✓ Added 2 event(s) to calendar
```

**In App:**
- Toast notification: "📸 New image received from iMessage!"
- Image appears at top of Images gallery
- Real-time update (no refresh needed)

## ⚡ Performance

✅ Fast image processing (5-10 seconds)
✅ Instant UI updates (real-time)
✅ No page reloads needed
✅ Smooth animations
✅ Responsive on all devices

## 🎓 Example Use Case

**Send:** Screenshot of course syllabus
**AI Extracts:**
- 5 assignment due dates
- 2 exam dates
- Project deadlines

**Results:**
- All dates converted to calendar events
- Events appear in calendar
- Image stored with metadata
- Can edit each event individually

## ✅ Checklist

Before testing:
- [ ] App running: `npm run dev`
- [ ] iMessage connected via BlueBubbles
- [ ] Database migrations applied
- [ ] Environment variables set
- [ ] Network tab shows API responses

Ready to test:
- [ ] Send test image via iMessage
- [ ] Check iMessage for bot response
- [ ] Open app and view Images tab
- [ ] Verify extracted information
- [ ] Test calendar event creation

## 📞 Commands

```bash
# Start dev server
npm run dev

# Run migrations (if needed)
# (Use Supabase Studio or SQL editor)

# Check if running
curl http://localhost:3000/

# Kill server if needed
lsof -ti:3000 | xargs kill -9  # Mac/Linux
netstat -ano | findstr :3000   # Windows
```

## 🎉 Summary

**Images sent via iMessage automatically:**
1. Get detected by AI bot
2. Are analyzed with Claude Vision
3. Have dates/events extracted
4. Create calendar events
5. Appear in Upload section
6. Can be managed and deleted

**Zero manual work. Full automation.** 📸➡️📅✨

---

**Status:** ✅ Ready to use  
**Location:** http://localhost:3000/  
**Feature:** Images auto-add to Upload section
