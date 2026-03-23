# BlueBubbles Integration - Quick Reference

## ✅ What Was Implemented

### 1. **Generic IMessageService Interface** (`lib/messaging/types.ts`)
- Platform-agnostic contract
- Any backend must implement this
- Decouples React from implementation details

### 2. **BlueBubblesMessageService** (`lib/messaging/bluebubbles-service.ts`)
- Implements IMessageService
- **ALL** BlueBubbles logic lives here:
  - WebSocket/socket.io connection
  - REST API fallback
  - Message reconciliation
  - Status tracking (sending → sent → delivered → read)
  - Event subscriptions

### 3. **Service Selector** (`lib/messaging/service-selector.ts`)
- ⚠️ **THE ONLY FILE THAT CHANGES WHEN SWAPPING BACKENDS**
- Centralized factory function
- Currently returns BlueBubblesMessageService
- Just change 1 line to switch to ProjectBlueService

### 4. **useMessaging Hook** (`hooks/use-messaging.ts`)
- React hook for components
- Manages optimistic UI state
- Handles subscription lifecycle
- Reconciles optimistic IDs with server IDs
- Error handling & retry logic

### 5. **MessagesView Component** (`components/messages-view.tsx`)
- Example UI component
- Uses useMessaging hook
- Shows optimistic messaging pattern
- Status indicators (⏳ sending, ✓ sent, ✓✓ delivered, read)
- Retry on failed messages

### 6. **Environment Setup** (`.env.local`)
- `NEXT_PUBLIC_BLUEBUBBLES_BASE_URL=https://excerpt-peer-profiles-tray.trycloudflare.com`
- `NEXT_PUBLIC_BLUEBUBBLES_SOCKET_URL=wss://excerpt-peer-profiles-tray.trycloudflare.com/socket.io`

---

## 🚀 Usage in Components

### Simplest Example:

```typescript
import { useMessaging } from '@/hooks/use-messaging';

export function MyChat() {
  const { messages, sendMessage, connected } = useMessaging();

  return (
    <div>
      {messages.map(msg => (
        <div key={msg.optimisticId}>{msg.text}</div>
      ))}
      <button onClick={() => sendMessage('conv1', 'Hi', 'user1')} disabled={!connected}>
        Send
      </button>
    </div>
  );
}
```

### Complete Example (with status tracking):

```typescript
import { useMessaging } from '@/hooks/use-messaging';
import { MessagesView } from '@/components/messages-view';

export function ChatPage({ conversationId, userId }: Props) {
  return <MessagesView conversationId={conversationId} currentUserId={userId} />;
}
```

---

## 🔄 Optimistic UI Pattern Explained

```
1. User sends message
   ↓
2. sendMessage() adds to UI immediately with status="sending" ✨
   ↓
3. Message visible right away (feels instant!)
   ↓
4. Server receives & responds with ACK
   ↓
5. Hook updates status → "sent"
   ↓
6. Later: delivery confirmation
   ↓
7. Status updates again → "delivered" or "read"
```

**Key:** User sees message instantly. Server updates happen in background.

---

## 🔐 No Hardcoding

✅ **GOOD:** All BlueBubbles URLs in env vars and service layer
❌ **BAD:** Socket URLs hardcoded in React components

```typescript
// ✅ Correct (in bluebubbles-service.ts)
const socket = io(this.config.socketUrl, {...});

// ❌ Wrong (don't do this in components)
const socket = io('wss://excerpt-peer-...', {...});
```

---

## 🔄 To Switch to Project Blue Later

### Only change this ONE file:

**Before:**
```typescript
// lib/messaging/service-selector.ts
serviceInstance = new BlueBubblesMessageService(config);
```

**After:**
```typescript
// lib/messaging/service-selector.ts
serviceInstance = new ProjectBlueService(config);
```

**That's it!** Everything else continues to work unchanged.

---

## 📦 How It Prevents Brittleness

| Requirement | How Implemented | Result |
|-----------|-----------------|--------|
| No socket logic in components | All in BlueBubblesMessageService | ✅ UI stays clean |
| No hardcoded URLs | Env vars + service config | ✅ Easy to change |
| No backend knowledge in UI | IMessageService interface | ✅ React is agnostic |
| Single swap point | service-selector.ts | ✅ One file to change |
| Optimistic UX | Hook returns optimisticId immediately | ✅ Feels instant |
| Status tracking | Message reconciliation in service | ✅ Accurate delivery status |

---

## 🧪 Testing

### Test service independently:
```typescript
const service = new BlueBubblesMessageService(config);
await service.initialize();
const id = await service.sendMessage('conv1', 'Hi', 'user1');
// id is optimisticId, message already visible
```

### Test hook:
```typescript
const { result } = renderHook(() => useMessaging());
act(() => {
  result.current.sendMessage('conv1', 'Hi', 'user1');
});
expect(result.current.messages[0].status).toBe('sending');
```

### Test component:
```typescript
render(<MessagesView conversationId="c1" currentUserId="u1" />);
fireEvent.change(input, { target: { value: 'Hello' } });
fireEvent.click(sendButton);
expect(screen.getByText('Hello')).toBeInTheDocument();
```

---

## 🚨 Error Handling

### Connection Lost:
```typescript
const { connected, error } = useMessaging();
if (!connected) {
  // Show "Reconnecting..." UI
}
```

### Send Failed:
```typescript
if (message.status === 'failed') {
  // Show retry button
  <button onClick={() => retrySendMessage(message.id)}>Retry</button>
}
```

---

## 📊 Message Lifecycle

```
Message created
    ↓ (optimisticId="opt_123")
Added to UI immediately
    ↓ status="sending"
Server ACK arrives
    ↓ status="sent"
Recipient receives it
    ↓ status="delivered"
Recipient opens chat
    ↓ status="read"
```

---

## 🎯 Architecture Goals - All Met ✅

- ✅ **Generic Interface:** IMessageService abstracts all backends
- ✅ **Single Implementation File:** BlueBubblesService contains all details
- ✅ **No Component Logic:** React uses only the hook
- ✅ **Single Swap Point:** service-selector.ts is the only change for backend switch
- ✅ **Optimistic UI:** Messages visible immediately (optimisticId pattern)
- ✅ **Status Tracking:** Complete message lifecycle (sending → read)
- ✅ **Event System:** Subscriptions for reactive updates
- ✅ **Error Handling:** Retry logic and error boundaries
- ✅ **Cleanup:** Proper unsubscribe on unmount
- ✅ **No Hardcoding:** All config from env vars

---

## 📚 File Reference

| File | Purpose | Modifiable? |
|------|---------|------------|
| `lib/messaging/types.ts` | IMessageService interface | No (define once) |
| `lib/messaging/bluebubbles-service.ts` | BlueBubbles implementation | No (until backend changes) |
| `lib/messaging/service-selector.ts` | Factory function | **YES - swap point** |
| `hooks/use-messaging.ts` | React hook | No (generic) |
| `components/messages-view.tsx` | Example UI | Can copy/customize |
| `.env.local` | Config | Yes (only URLs) |

---

## 🎓 Learning Points

1. **Adapter Pattern:** Interface + concrete implementation = swappable parts
2. **Single Responsibility:** Each file has one job
3. **Dependency Inversion:** Components depend on interface, not implementation
4. **Optimistic UI:** Show changes instantly, reconcile with server later
5. **Event-Driven:** Services emit events, hooks subscribe to them

---

**Ready to integrate with BlueBubbles! 🚀**
