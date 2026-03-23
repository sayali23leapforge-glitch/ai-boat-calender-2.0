# BlueBubbles Messaging Integration - Architecture Documentation

## Overview

This implementation connects the React application to BlueBubbles using the **Adapter Pattern**. The architecture is designed to allow seamless backend swapping (e.g., to Project Blue) by changing a single file.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    React Components                          │
│                  (MessagesView, Chat UI)                     │
│                   NO messaging logic here                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ uses
                     ▼
        ┌────────────────────────────┐
        │   useMessaging Hook        │
        │  (Optimistic UI handling)  │
        └────────────────┬───────────┘
                         │
                         │ delegates to
                         ▼
        ┌────────────────────────────┐
        │  service-selector.ts       │
        │ (THE SINGLE SWAP POINT)    │
        └────────────────┬───────────┘
                         │
                         │ returns
                         ▼
        ┌────────────────────────────┐
        │ BlueBubblesMessageService  │
        │  (IMessageService impl)    │
        │                            │
        │  - REST API calls          │
        │  - WebSocket/socket.io     │
        │  - Message reconciliation  │
        └────────────────┬───────────┘
                         │
                         │ connects to
                         ▼
        ┌────────────────────────────┐
        │   BlueBubbles Server       │
        │ (wss://excerpt-peer...)    │
        └────────────────────────────┘
```

## File Structure

```
lib/messaging/
├── index.ts                  # Public exports
├── types.ts                  # IMessageService interface & types
├── service-selector.ts       # ⚠️ THE ONLY FILE TO CHANGE FOR BACKEND SWAP
├── bluebubbles-service.ts   # BlueBubbles implementation (all details here)
│
hooks/
├── use-messaging.ts         # React hook for components
│
components/
├── messages-view.tsx        # Example UI component
│
.env.local
├── NEXT_PUBLIC_BLUEBUBBLES_BASE_URL
└── NEXT_PUBLIC_BLUEBUBBLES_SOCKET_URL
```

## Core Concepts

### 1. **IMessageService Interface** (`types.ts`)

Generic interface that ANY backend must implement:

```typescript
interface IMessageService {
  initialize(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  sendMessage(conversationId: string, text: string, sender: string): Promise<string>;
  getConversation(conversationId: string, limit?: number): Promise<Message[]>;
  getConversations(): Promise<Conversation[]>;
  onMessage(callback: (message: Message) => void): () => void;
  onMessageStatus(callback: (messageId: string, status: MessageStatus) => void): () => void;
  onConnectionStatusChange(callback: (connected: boolean) => void): () => void;
  onConversationUpdate(callback: (conversation: Conversation) => void): () => void;
  markAsRead(conversationId: string, messageId: string): Promise<void>;
  retrySendMessage(messageId: string): Promise<void>;
}
```

### 2. **BlueBubblesMessageService** (`bluebubbles-service.ts`)

Implements the interface with BlueBubbles-specific logic:

- **Socket.io Connection**: Real-time bidirectional communication
- **REST API Fallback**: If socket unavailable
- **Message Reconciliation**: Maps optimistic IDs to server IDs
- **Status Tracking**: Tracks sending → sent → delivered → read
- **Event Listeners**: Multiple subscriptions for reactive updates

**Key methods:**
- `initialize()` - Connects to BlueBubbles WebSocket
- `sendMessage()` - Returns optimisticId immediately (doesn't wait for server)
- `onMessage()`, `onMessageStatus()` - Event subscriptions

### 3. **Service Selector** (`service-selector.ts`)

⚠️ **THIS IS THE ONLY FILE THAT CHANGES WHEN SWAPPING BACKENDS**

```typescript
export function getMessageService(): IMessageService {
  // Change from BlueBubblesMessageService to ProjectBlueService here
  serviceInstance = new BlueBubblesMessageService(config);
  return serviceInstance;
}
```

### 4. **useMessaging Hook** (`use-messaging.ts`)

Provides a React-friendly interface:

```typescript
const {
  messages,           // All messages in UI
  conversations,      // All conversations
  connected,          // Connection status
  loading,            // Initial load state
  error,              // Error messages
  sendMessage,        // Send a message
  fetchConversation,  // Load history
  fetchConversations, // Load all conversations
  markAsRead,         // Mark as read
  retrySendMessage,   // Retry failed message
} = useMessaging();
```

**Handles:**
- Subscription lifecycle (connect/disconnect on mount/unmount)
- Optimistic message reconciliation
- Status tracking
- Error handling

### 5. **MessagesView Component** (`messages-view.tsx`)

Example UI component showing best practices:

```typescript
export function MessagesView({ conversationId, currentUserId }: MessagesViewProps) {
  const { messages, sendMessage, connected, ... } = useMessaging();
  
  // NO BlueBubbles logic here - just React UI
  // Sends are optimistic - show immediately
  // Statuses update when ACK arrives
}
```

## Optimistic UI (Hotwire Pattern)

### Flow:

```
User types "Hello"
        │
        ▼
User clicks Send
        │
        ▼
sendMessage() called
        │
        ├─ Generate optimisticId: "opt_1704775200000_abc123"
        │
        ├─ Add to state immediately: status = "sending" ✓ (UI updates NOW)
        │
        ├─ Send to server (fire-and-forget)
        │
        └─ Return optimisticId
        
Background:
        │
        ├─ Server receives message
        │
        ├─ Sends ACK: { optimisticId, serverId: "msg_456" }
        │
        ├─ socket.on('message:ack') fires
        │
        └─ Update state: match optimisticId to serverId, status = "sent"
        
Later:
        │
        ├─ Server routes message
        │
        ├─ Recipient receives it
        │
        ├─ Server sends: { messageId: "msg_456", status: "delivered" }
        │
        └─ Update state: status = "delivered" ✓✓
```

### Status Flow:

```
"sending"  ──(ACK)──> "sent"  ──(delivered)──> "delivered"  ──(read)──> "read"
            ──(fail)──> "failed"  ──(retry)──> "sending" ...
```

### UI Shows:

- ⏳ Sending... (while sending)
- ✓ Sent (ACK received)
- ✓✓ Delivered (recipient has it)
- ✓✓ Read (recipient opened it)
- [Retry] button (if failed)

## How to Use in Components

### Basic Usage:

```typescript
import { useMessaging } from '@/hooks/use-messaging';

export function ChatComponent({ conversationId, userId }: Props) {
  const {
    messages,
    connected,
    sendMessage,
    fetchConversation,
  } = useMessaging();

  useEffect(() => {
    fetchConversation(conversationId);
  }, [conversationId]);

  const handleSend = async (text: string) => {
    // This returns immediately with optimisticId
    await sendMessage(conversationId, text, userId);
    // Message is already visible in UI!
  };

  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.optimisticId}>
          {msg.text}
          <StatusBadge status={msg.status} />
        </div>
      ))}
      <SendForm onSend={handleSend} disabled={!connected} />
    </div>
  );
}
```

### Advanced: Custom Listener

```typescript
const service = getMessageService();

// Subscribe directly to raw events
const unsubscribe = service.onMessage((message) => {
  console.log('New message:', message);
});

// Later: cleanup
unsubscribe();
```

## Switching to Project Blue

### Step 1: Create ProjectBlueService

```typescript
// lib/messaging/projectblue-service.ts
export class ProjectBlueService implements IMessageService {
  // Implement same interface, but different internals
  // (REST API calls instead of socket.io, different event format, etc.)
}
```

### Step 2: Update Service Selector

```typescript
// lib/messaging/service-selector.ts
import { ProjectBlueService } from './projectblue-service';

export function getMessageService(): IMessageService {
  // Change this ONE line:
  serviceInstance = new ProjectBlueService(config); // ← ONLY CHANGE
  return serviceInstance;
}
```

### Step 3: Done! ✅

- No component changes
- No hook changes
- No UI changes
- Everything continues to work

## Error Handling

### Connection Errors:

```typescript
const { connected, error } = useMessaging();

if (!connected) {
  return <ReconnectingIndicator />;
}

if (error) {
  return <ErrorBanner message={error} />;
}
```

### Failed Messages:

```typescript
if (message.status === 'failed') {
  return (
    <div>
      <span>{message.text}</span>
      <button onClick={() => retrySendMessage(message.id)}>
        Retry
      </button>
    </div>
  );
}
```

## Environment Variables

Required in `.env.local`:

```
NEXT_PUBLIC_BLUEBUBBLES_BASE_URL=https://excerpt-peer-profiles-tray.trycloudflare.com
NEXT_PUBLIC_BLUEBUBBLES_SOCKET_URL=wss://excerpt-peer-profiles-tray.trycloudflare.com/socket.io
```

When switching to Project Blue, update these to:

```
NEXT_PUBLIC_PROJECTBLUE_BASE_URL=...
NEXT_PUBLIC_PROJECTBLUE_SOCKET_URL=...
```

And update the service selector to read the new env vars.

## Testing

### Unit Tests (Service):

```typescript
describe('BlueBubblesMessageService', () => {
  it('should send message with optimisticId', async () => {
    const service = new BlueBubblesMessageService(config);
    const id = await service.sendMessage('conv1', 'Hi', 'user1');
    expect(id).toMatch(/^opt_/);
  });

  it('should reconcile optimisticId with serverId on ACK', () => {
    // Mock socket ACK event
    // Verify optimisticId is updated to serverId
  });
});
```

### Integration Tests (Hook):

```typescript
describe('useMessaging', () => {
  it('should show optimistic message immediately', async () => {
    const { result } = renderHook(() => useMessaging());
    
    act(() => {
      result.current.sendMessage('conv1', 'Hi', 'user1');
    });
    
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].status).toBe('sending');
  });
});
```

## Debugging

### Enable Verbose Logging:

```typescript
// In bluebubbles-service.ts
if (process.env.NODE_ENV === 'development') {
  console.log('[BlueBubbles] Message sent:', optimisticId);
  console.log('[BlueBubbles] Status update:', messageId, status);
}
```

### Browser DevTools:

```javascript
// In console
const service = window.__messageService;
service.onMessage(msg => console.log('Message:', msg));
service.onMessageStatus((id, status) => console.log('Status:', id, status));
```

## Common Issues

### Q: Messages not sending?
**A:** Check:
1. `NEXT_PUBLIC_BLUEBUBBLES_BASE_URL` is correct
2. BlueBubbles server is online
3. Check browser console for errors
4. Verify socket connection: `service.isConnected()`

### Q: Optimistic message not updating after ACK?
**A:** Ensure `message:ack` event is fired by server and matches optimisticId format.

### Q: High memory usage?
**A:** Verify unsubscribe functions are called on unmount. Check no circular references in message objects.

---

**Architecture is complete and ready for production! 🚀**
