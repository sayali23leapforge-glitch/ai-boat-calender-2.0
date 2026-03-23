# Conflict Detection & iMessage Alerts System

## Overview

The AI bot now monitors for conflicts and automatically sends alerts via iMessage when issues are detected.

## Features

### 1. **Calendar Conflicts**
- Detects overlapping events
- Alerts user via iMessage
- Example: "📅 Calendar Conflict: Team Meeting overlaps with Doctor Appointment"

### 2. **Duplicate Tasks**
- Finds tasks with identical or similar titles
- Suggests consolidation
- Example: "⚠️ Duplicate Task: 'Project Report' found 2 times"

### 3. **Overdue Items**
- Tracks tasks past their due date
- Sends reminders via iMessage
- Example: "⏰ You have 3 overdue task(s)"

## How It Works

### Automatic Monitoring (Recommended)
When you provide a `conversationId`, the system automatically:
1. Checks for conflicts every 5 minutes
2. Sends alerts via iMessage for high-severity issues
3. Logs all conflicts for later review

### Manual Checks
Trigger conflict checks manually:
```typescript
import { useConflictDetection } from '@/hooks/use-conflict-detection';

export function MyComponent({ userId, conversationId }) {
  const { 
    conflicts, 
    checkConflicts,
    checkCalendar,
    checkDuplicates 
  } = useConflictDetection(userId, conversationId);

  return (
    <div>
      <button onClick={checkConflicts}>Check All Conflicts</button>
      <button onClick={checkCalendar}>Check Calendar Only</button>
      <button onClick={checkDuplicates}>Check for Duplicates</button>
    </div>
  );
}
```

## API Endpoints

### POST `/api/conflicts/check`

**Check all conflicts:**
```json
{
  "userId": "user-123",
  "conversationId": "imessage-conv-456",
  "action": "check"
}
```

**Check specific type:**
```json
{
  "userId": "user-123",
  "conversationId": "imessage-conv-456",
  "action": "calendar" | "duplicates" | "overdue"
}
```

**Response:**
```json
{
  "status": "success",
  "conflicts": [
    {
      "id": "conflict_123",
      "type": "calendar",
      "title": "Calendar Conflict: Meeting A overlaps with Meeting B",
      "description": "...",
      "items": ["Meeting A", "Meeting B"],
      "severity": "high",
      "resolved": false
    }
  ],
  "count": 1,
  "highSeverity": 1,
  "message": "Found 1 conflict(s). Alerts sent via iMessage."
}
```

## Using in Components

### Display Conflict Alerts
```typescript
import { ConflictAlert } from '@/components/conflict-alert';

export function Dashboard({ userId, conversationId }) {
  return (
    <div>
      <h1>Your Dashboard</h1>
      {/* Shows conflicts and sends alerts via iMessage */}
      <ConflictAlert 
        userId={userId} 
        conversationId={conversationId}
        autoMonitor={true}
      />
    </div>
  );
}
```

### Show Conflict Badge
```typescript
import { ConflictBadge } from '@/components/conflict-alert';

export function Header({ userId, conversationId }) {
  return (
    <header>
      {/* Shows badge if there are conflicts */}
      <ConflictBadge userId={userId} conversationId={conversationId} />
    </header>
  );
}
```

## Integration with Chat

When integrated with the chat API, conflicts are:
1. **Detected automatically** after task/event creation
2. **Sent via iMessage** as alerts
3. **Logged in UI** with conflict details
4. **Actionable** - user can resolve directly

Example iMessage flow:
```
User: "Create a meeting at 2pm tomorrow"
↓
AI Bot: Creates event
↓
Conflict Detection: Detects it overlaps with existing event
↓
AI Bot: Sends iMessage alert: "📅 Calendar Conflict: New Meeting overlaps with existing Doctor Appointment"
↓
User sees alert in iMessage and can reschedule
```

## Severity Levels

| Severity | Color | Action |
|----------|-------|--------|
| **high** | 🔴 Red | Alerts sent via iMessage immediately |
| **medium** | 🟡 Yellow | Shown in UI, optional alert |
| **low** | ⚪ Gray | Logged for reference |

## Configuration

The monitoring runs automatically every **5 minutes** by default.

To customize:
```typescript
const { startMonitoring, stopMonitoring } = useConflictDetection(userId, conversationId);

// Manually start monitoring
startMonitoring();

// Stop monitoring
stopMonitoring();
```

## Examples

### Example 1: Calendar Conflict
```
Scenario: User has "Team Meeting" 2-3pm, tries to add "Doctor Appointment" 2:30-3:30pm

Detection: Overlap detected
Alert: "📅 Calendar Conflict: Team Meeting (2:00 PM) overlaps with Doctor Appointment (2:30 PM)"
Sent to: iMessage
Action: User reschedules one event
```

### Example 2: Duplicate Task
```
Scenario: User creates "Project Report" task, already has "Project Report" task

Detection: Similar titles found
Alert: "⚠️ Duplicate Task: 'Project Report'. Found 2 similar tasks. Consider consolidating them."
Sent to: iMessage
Action: User merges tasks or deletes duplicate
```

### Example 3: Overdue Items
```
Scenario: User has 3 past-due tasks

Detection: Due dates before current date
Alert: "⏰ You have 3 overdue task(s): • Finish Report • Review Slides • Send Email"
Sent to: iMessage + shown in dashboard
Action: User completes or reschedules tasks
```

## Summary

✅ **AI bot is connected to iMessage**
✅ **Conflicts are detected automatically**
✅ **Users are notified via iMessage messages**
✅ **All conflict types covered: calendar, duplicates, overdue**
✅ **Real-time monitoring every 5 minutes**

The user will always know when there's a conflict because the AI bot sends them a message in iMessage!
