# Image Upload & Processing via iMessage

## Overview

When users send images via iMessage, the AI bot automatically:
1. ✅ Receives and processes the image
2. ✅ Extracts text, dates, and events using Claude Vision
3. ✅ Displays results in the Upload section
4. ✅ Creates calendar events automatically
5. ✅ Sends summary back via iMessage

## How It Works

### User Flow

```
1. User sends image via iMessage
   ↓
2. BlueBubbles receives image message
   ↓
3. AI bot detects image attachment
   ↓
4. Claude Vision analyzes image
   ↓
5. Extracts:
   • Text content
   • Dates (YYYY-MM-DD format)
   • Events with dates
   ↓
6. Creates calendar events
   ↓
7. Displays in Upload section
   ↓
8. Sends iMessage summary
```

### Example

**User sends:** Screenshot of syllabus with dates

**AI Bot:**
```
📸 Image Processed!

📅 Dates found: 3
  • 2026-03-15
  • 2026-04-20
  • 2026-05-10

📝 Events: 2
  • Midterm Exam - 2026-03-15
  • Final Project Due - 2026-05-10

✓ Added 2 event(s) to calendar
```

## API Endpoints

### POST `/api/images/process`

Process an image and extract dates/events

**Request:**
```json
{
  "imageUrl": "https://example.com/image.jpg",
  "userId": "user-123",
  "conversationId": "imessage-conv-456",
  "sender": "John Doe",
  "createEvents": true
}
```

**Response:**
```json
{
  "status": "success",
  "imageUpload": {
    "id": "img_1234567890",
    "userId": "user-123",
    "conversationId": "imessage-conv-456",
    "sender": "John Doe",
    "imageUrl": "https://example.com/image.jpg",
    "extractedText": "Full text from image...",
    "extractedDates": ["2026-03-15", "2026-04-20"],
    "extractedEvents": [
      {
        "title": "Midterm Exam",
        "date": "2026-03-15",
        "description": "Chapter 1-5"
      }
    ],
    "uploadedAt": 1674867890000,
    "processed": true
  },
  "createdEventIds": ["event-1", "event-2"],
  "message": "Image processed: 2 date(s) found, 2 event(s) created"
}
```

## Image Handling

### Supported Image Formats
- JPEG/JPG
- PNG
- GIF
- WebP
- BMP

### Vision Analysis

The system uses Claude 3.5 Sonnet Vision to:

```
1. Read ALL text in the image
2. Identify dates (any date format)
3. Extract events with associated dates
4. Understand context (deadlines, meetings, etc.)
5. Return structured JSON data
```

### Date Extraction

Recognizes:
- ISO dates: `2026-03-15`
- Written dates: `March 15, 2026`
- Relative dates: `Next Monday`
- Date ranges: `March 15-20`
- Times: `2pm Tuesday`

## Integration with Upload Section

### Display Component

The `ImageDisplay` component shows:
- 📷 Image thumbnail
- ✓ Processing status
- 📅 All extracted dates as badges
- 📝 List of detected events
- 👤 Sender information
- ⏰ Upload timestamp

```typescript
import { ImageDisplay } from '@/components/image-display';

<ImageDisplay 
  image={imageData}
  onDelete={(id) => console.log('Delete:', id)}
  onCreateEvent={(event) => console.log('Create:', event)}
/>
```

### Image Gallery

Show multiple uploaded images in a grid:

```typescript
import { ImageGallery } from '@/components/image-display';

<ImageGallery 
  images={images}
  onDelete={deleteHandler}
  onCreateEvent={createEventHandler}
  loading={isLoading}
/>
```

## Calendar Event Creation

When events are extracted from images:

```typescript
// Automatically created
{
  title: "Extracted event title",
  description: "From image: [extracted context]",
  start_time: "2026-03-15T00:00:00Z",
  end_time: "2026-03-15T01:00:00Z", // 1 hour by default
  source: "image_extraction"
}
```

User can then:
- Edit event details
- Add time
- Set reminders
- Add to specific calendar

## iMessage Integration

### Automatic Notifications

When image is processed, AI sends:
```
📸 Image Processed!

📅 Dates found: X
  • YYYY-MM-DD
  • YYYY-MM-DD

📝 Events: Y
  • Event title - YYYY-MM-DD

✓ Added Z event(s) to calendar
```

### Conversational

```
User: "Here's the class schedule"
[sends image]

AI: "📸 Image Processed!
📅 Dates found: 5
📝 Events: 4
✓ Added 4 event(s) to calendar"

User: "Great! Can you remind me about the midterm?"

AI: "✓ Set reminder for Midterm Exam on March 15"
```

## Examples

### Example 1: Syllabus Upload

**User sends:** Screenshot of course syllabus

**Extracted:**
```json
{
  "extractedDates": ["2026-02-01", "2026-03-15", "2026-04-20", "2026-05-10"],
  "extractedEvents": [
    {
      "title": "First Quiz",
      "date": "2026-02-01",
      "description": "Chapters 1-2"
    },
    {
      "title": "Midterm Exam",
      "date": "2026-03-15",
      "description": "Cumulative, Chapters 1-5"
    },
    {
      "title": "Final Project Deadline",
      "date": "2026-05-10",
      "description": "Submit via Canvas"
    }
  ]
}
```

### Example 2: Meeting Schedule

**User sends:** Screenshot of team meeting calendar

**Extracted:**
```json
{
  "extractedDates": ["2026-01-30", "2026-02-06", "2026-02-13"],
  "extractedEvents": [
    {
      "title": "Team Standup",
      "date": "2026-01-30",
      "description": "10am - Weekly sync"
    },
    {
      "title": "Project Review",
      "date": "2026-02-06",
      "description": "2pm - All hands"
    }
  ]
}
```

## Configuration

### Image Processing Settings

```typescript
// Default settings in image-processor.ts
- Model: Claude 3.5 Sonnet
- Max tokens: 1024
- Vision analysis: Full image
- Date format: ISO 8601 (YYYY-MM-DD)
- Event duration: 1 hour (default)
```

### Database Storage

Images are stored with metadata:
```sql
image_uploads table:
- id: unique identifier
- user_id: user reference
- conversation_id: iMessage conversation
- image_url: storage location
- extracted_text: OCR text
- extracted_dates: date array
- extracted_events: JSON events
- uploaded_at: timestamp
- processed: status flag
```

## Summary

✅ **Images from iMessage are automatically processed**
✅ **Dates and events extracted using AI Vision**
✅ **Results displayed in Upload section**
✅ **Calendar events created automatically**
✅ **User notified via iMessage**
✅ **Can edit and manage created events**

The user never has to manually upload documents—just send images via iMessage!
