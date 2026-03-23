# Bloo Webhook Integration Guide

## Endpoint Overview

**Webhook URL:** `https://your-domain.com/api/webhooks/bloo`
**Method:** `POST`
**Response:** Always returns `HTTP 200` with `{ "message": "..." }`

## How It Works

1. **Receives** Bloo message webhook with message text and sender phone
2. **Normalizes** phone number to international format (+91..., +1..., etc.)
3. **Finds** user in database using phone number from `user_profiles` table
4. **Returns 200 OK** if user not found (no errors)
5. **Analyzes** message using Gemini AI to detect intent
6. **Creates** task, event, or goal based on AI response
7. **Logs** all steps for debugging

## Request Format

### Example 1: Simple Task Message

```json
{
  "message": "remind me to buy groceries tomorrow",
  "phone": "9881234567",
  "timestamp": "2026-03-18T10:30:00Z",
  "conversationId": "conv_123"
}
```

**Result:** Creates task "buy groceries" with due_date = 2026-03-19

### Example 2: Message with Structured Sender

```json
{
  "text": "create goal learn spanish",
  "sender": {
    "phoneNumber": "+919881234567",
    "name": "John"
  },
  "chatId": "chat_456"
}
```

**Result:** Creates goal "learn spanish" with category = personal

### Example 3: Event with Time

```json
{
  "body": "meeting with team tomorrow at 3pm",
  "from": "+919881234567",
  "timestamp": "2026-03-18T14:15:00Z"
}
```

**Result:** Creates event "meeting with team" on 2026-03-19 at 15:00

### Example 4: Alternative Field Names

```json
{
  "message": "buy milk today",
  "sender": "9881234567"
}
```

**Field Combinations Supported:**
- Message: `message`, `text`, `body`
- Phone: `phone`, `sender`, `from`, `phoneNumber`
- (Phone can be string or object with `phoneNumber`/`phone`/`address`/`handle`/`from` properties)

## Phone Number Normalization

The webhook automatically normalizes phone numbers:

| Input | Normalized | Region |
|-------|-----------|--------|
| `9881234567` | `+919881234567` | India (10 digits) |
| `919881234567` | `+919881234567` | India (12 digits) |
| `+919881234567` | `+919881234567` | Already normalized |
| `9881234567` | `+919881234567` | Default to India |
| `+14155552671` | `+14155552671` | US number |
| `14155552671` | `+14155552671` | US (11 digits starting with 1) |

## AI Intent Detection

The Gemini AI analyzes messages and classifies them as:

### TASK
Actions to complete: "do X", "complete X", "remind me to X"
- Examples: "buy groceries", "call mom", "fix bugs tomorrow"
- Creates entry in `tasks` table

### GOAL
Learning/achievement goals: "learn X", "get X", "become X"
- Examples: "learn spanish", "get healthier", "master python"
- Creates entry in `goals` table

### EVENT
Scheduled meetings/appointments: "meeting with X", "lunch at X time"
- Examples: "meeting with team tomorrow", "doctor appointment next week"
- Creates entry in `calendar_events` table
- Requires a date

### IGNORE
Non-actionable messages: greetings, questions, chat
- Examples: "hello", "how are you", "what's up"
- No action taken, returns HTTP 200

## Extracted Data Fields

When message is processed:

```javascript
{
  "type": "task" | "goal" | "event" | null,
  "title": "Cleaned message text (max 200 chars)",
  "date": "2026-03-19" | null,        // ISO format
  "time": "15:00" | null               // HH:MM format
}
```

**Date Detection:**
- "tomorrow" → next day
- "next monday" → next Monday
- "feb 15" / "2/15" → 2026-02-15
- "2026-03-19" → 2026-03-19
- No date mentioned → null

**Time Detection:**
- "3pm" / "15:00" / "15" → Extracted and normalized

## Database Changes

### Tasks Table
```javascript
{
  user_id: "uuid",
  list_id: "uuid",
  title: "buy groceries",
  notes: "From Bloo webhook",
  due_date: "2026-03-19",
  due_time: "15:00" | null,
  priority: "medium",
  is_completed: false,
  position: auto-incremented,
  metadata: {
    source: "bloo_webhook",
    originalMessage: "original message text"
  }
}
```

### Goals Table
```javascript
{
  user_id: "uuid",
  title: "learn spanish",
  description: "From Bloo webhook: original message text",
  category: "personal",
  priority: "medium",
  progress: 0,
  target_date: "2026-03-19" | null
}
```

### Calendar Events Table
```javascript
{
  user_id: "uuid",
  title: "meeting with team",
  description: "From Bloo webhook: original message text",
  event_date: "2026-03-19",
  start_time: "15:00" | null,
  end_time: null,
  category: "other",
  priority: "medium",
  source: "webhook",
  source_id: "bloo",
  is_completed: false
}
```

## Environment Setup

Required in `.env.local`:
```
GEMINI_API_KEY=AIzaSyAIYY6DuSVA-GqgRAwpkQQnuVAY4ff1KlU
SUPABASE_URL=https://ofkthnxcfkdtnrxgrbnq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
```

## Error Handling & Logging

All events are logged with `[BlooWebhook]` prefix:

```
[BlooWebhook] Received POST request
[BlooWebhook] Raw payload: {...}
[BlooWebhook] Extracted text: "buy groceries tomorrow"
[BlooWebhook] Extracted sender: "9881234567"
[BlooWebhook] Normalized phone: "+919881234567"
[BlooWebhook] Looking up user by phone: "+919881234567"
[BlooWebhook] User found: "user-uuid-123"
[BlooWebhook] Calling Gemini API for AI analysis...
[BlooWebhook] Gemini analysis result: { type: "task", title: "buy groceries", date: "2026-03-19", time: null }
[BlooWebhook] Creating task: buy groceries
[BlooWebhook] Task created successfully
```

## Response Behavior

**Always returns HTTP 200** in these cases:
- ✅ Message processed successfully
- ✅ No message text provided
- ✅ Sender phone not found
- ✅ User not registered for phone number
- ✅ AI couldn't detect actionable intent
- ✅ Database error occurred
- ✅ Any exception during processing

This prevents webhook retry loops and dead-letter queues.

## Integration with Render Deployment

The webhook is automatically available at:
```
https://<render-app-url>/api/webhooks/bloo
```

1. Deploy your latest code to Render
2. Configure Bloo webhook URL in Bloo dashboard: `https://<render-app-url>/api/webhooks/bloo`
3. Test with sample message from Bloo
4. Check server logs: `<render-app-url>/logs`

## Testing the Webhook

### Option 1: Using cURL
```bash
curl -X POST http://localhost:3000/api/webhooks/bloo \
  -H "Content-Type: application/json" \
  -d '{
    "message": "remind me to buy milk tomorrow",
    "phone": "9881234567"
  }'
```

### Option 2: Using Postman
- URL: `POST http://localhost:3000/api/webhooks/bloo`
- Headers: `Content-Type: application/json`
- Body (raw JSON): See examples above

### Option 3: Using Node.js
```javascript
fetch("http://localhost:3000/api/webhooks/bloo", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    message: "create goal learn javascript",
    phone: "9881234567"
  })
})
.then(r => r.json())
.then(console.log);
```

## Troubleshooting

### User Not Found
- Check if phone number exists in `user_profiles` table
- Verify phone normalization matches: `9881234567` → `+919881234567`
- Run manually to check: 
  ```sql
  SELECT user_id, phone FROM user_profiles WHERE phone = '+919881234567';
  ```

### AI Analysis Returns Nothing
- Check `GEMINI_API_KEY` in `.env.local`
- Message might be non-actionable (greeting, question, etc.)
- Check server logs for API errors

### Task/Goal/Event Not Creating
- Check Supabase database for table names and columns
- Verify `user_id` is correctly fetched
- Check for database constraints or RLS policies
- Review server logs: `[BlooWebhook]` entries

### Webhook Not Receiving Events
- Verify URL is publicly accessible
- Check firewall/network rules
- Enable all CORS headers in Bloo settings
- Test with cURL from command line
- Check server response time (should be < 2 seconds)

## Code Structure

**File:** `/app/api/webhooks/bloo/route.ts`

### Key Functions:
- `sanitizeText()` - Remove control characters
- `normalizePhone()` - Convert to international format
- `extractText()` - Get message from various field names
- `extractSenderPhone()` - Get phone from various field names
- `analyzeWithGemini()` - AI intent detection
- `POST()` - Main webhook handler

### Data Flow:
```
Webhook Request
    ↓
Extract Text & Phone
    ↓
Normalize Phone
    ↓
Lookup User in DB
    ↓ (User not found)
Return 200 OK
    ↓ (User found)
Analyze with Gemini AI
    ↓ (No action detected)
Return 200 OK
    ↓ (Action detected)
Create Task/Goal/Event
    ↓
Return 200 OK
```

## Future Enhancements

- Add message attachments (images, files)
- Support webhook signature verification
- Add rate limiting per user/phone
- Store webhook events history
- Add webhook retry logic for failed operations
- Support custom task list selection
- Add event reminders integration
