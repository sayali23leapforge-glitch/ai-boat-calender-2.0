# Calendar App - Features List

## 1. Login & Sign Up
- Users create account with email/password
- Secure authentication via Supabase
- Password reset option available
- User profile creation on first login

## 2. Calendar Management
- Create, edit, delete calendar events
- View calendar in month/week/day view
- Set event time, date, and description
- Recurring events (daily, weekly, monthly, yearly)
- Event reminders before event starts
- Color coding for events
- Conflict detection - warns if events overlap

## 3. Task Management
- Create tasks with title and description
- Assign priority (High, Medium, Low)
- Set due dates for tasks
- Organize tasks in custom lists (Work, Personal, etc.)
- Mark tasks as Done/Incomplete
- Delete tasks
- Search for tasks

## 4. Goals & Priority Dashboard
- Create long-term goals
- Track goal progress
- Visual priority dashboard showing high-priority items
- See which tasks are due soon
- Focus mode to hide non-essential items

## 5. AI Bot - Automatic Task & Event Creation
- Type or speak to AI: "Create event: meeting with John at 2pm Friday"
- AI understands natural language
- Automatically creates events/tasks from your message
- Works via iMessage and chat widget
- AI parses dates, times, priorities automatically

## 6. Voice Input & Microphone
- Click microphone button to start recording
- Speak naturally: "Add task: call dentist next month"
- OpenAI Whisper converts speech to text
- AI creates task/event from what you said
- Works everywhere in the app

## 7. Image Upload & Processing
- Upload images by dragging or clicking upload
- AI automatically reads text from images using OCR
- Extracts dates and events from images
- Creates calendar events automatically
- Shows "Images" tab with all uploaded images
- Can delete images anytime

## 8. Document Upload
- Upload PDF and image documents
- AI reads the document
- Extracts all dates and events
- Example: Upload syllabus → AI creates all course deadlines as events
- Events appear in calendar automatically

## 9. iMessage Integration (BlueBubbles)
- Send messages to AI bot via iMessage
- AI bot responds in iMessage
- Send images via iMessage → AI processes them
- Send task requests via iMessage → AI creates them
- See all conversations in app

## 10. AI Bot Features (via iMessage)
**Send text message:**
- "Create event: team meeting Tuesday 3pm"
- Bot: "✅ Event created"
- Event appears in calendar

**Send image:**
- Send syllabus photo
- Bot analyzes image
- Extracts all dates and deadlines
- Creates events automatically
- Bot: "✅ Added 5 events from your image"

**Send document:**
- Upload course schedule PDF
- Bot extracts dates
- Creates all events
- Bot confirms what was added

## 11. Real-Time Sync
- When you create event on phone → appears on desktop instantly
- When you upload image via iMessage → appears in app instantly
- All devices stay synced in real-time
- No need to refresh to see updates

## 12. Dashboard & Overview
- See all your tasks in one place
- See all your events in calendar
- Quick view of today's schedule
- See what's due soon
- See high-priority items
- Statistics: total tasks, completed, overdue

## 13. Notifications & Reminders
- Get reminded before events start
- Get notifications for due tasks
- In-app toast notifications
- Toast shows when image is processed
- Toast confirms when task/event created

## 14. Chat Widget
- Built-in messaging interface
- Talk to AI bot directly
- Create tasks by chatting with AI
- Get AI suggestions

## 15. Email Parser
- Paste email content
- AI extracts important information
- Creates tasks/events from email

## 16. User Profile & Settings
- Create user profile
- Set preferences
- Manage account
- Logout

## 17. Focus Mode
- Hide completed tasks
- Show only high-priority items
- Minimize distractions
- Perfect for deep work

## 18. Responsive Design
- Works on desktop, tablet, phone
- Mobile-friendly interface
- Dark mode and light mode
- Easy navigation

---

## How Everything Connects

### User sends image via iMessage:
```
User → iMessage → BlueBubbles → AI Bot → Reads image → Creates events → 
Events in calendar → Image appears in Upload section → Real-time sync to app
```

### User speaks a command:
```
User clicks microphone → Speaks → Whisper transcribes → AI understands → 
Creates task/event → Shows in dashboard
```

### User uploads document:
```
User uploads PDF/image → AI reads it → Extracts dates → 
Creates events → Real-time sync → See in calendar
```

### User types to AI bot:
```
User: "Create event..." → AI parses → Creates in database → 
Real-time sync → Appears in calendar
```
