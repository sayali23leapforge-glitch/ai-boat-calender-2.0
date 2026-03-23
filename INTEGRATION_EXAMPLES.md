/**
 * Example Integration: How to add MessagesView to Your Existing UI
 * 
 * This shows how to integrate the BlueBubbles messaging component
 * into your calendar app's existing structure
 */

import React, { useState } from 'react';
import { MessagesView } from '@/components/messages-view';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMessaging } from '@/hooks/use-messaging';
import { cn } from '@/lib/utils';

/**
 * Option 1: Standalone Messages Page
 * Route: /messages/:conversationId
 */
export function MessagesPage({ params }: { params: { conversationId: string } }) {
  const userId = useAuth()?.user?.id || '';

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <h2 className="font-semibold">Chat - {params.conversationId}</h2>
      </div>

      {/* Messages Component */}
      <MessagesView
        conversationId={params.conversationId}
        currentUserId={userId}
      />
    </div>
  );
}

/**
 * Option 2: Embedded in Sidebar
 * Small message list in side panel
 */
export function MessagesSidebar() {
  const { conversations } = useMessaging();

  return (
    <div className="w-64 border-r bg-muted/30 flex flex-col">
      <div className="border-b p-4">
        <h3 className="font-semibold">Messages</h3>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 p-2">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className="p-3 rounded-lg hover:bg-muted/50 cursor-pointer"
          >
            <p className="text-sm font-medium truncate">
              {conv.displayName || conv.id}
            </p>
            {conv.lastMessage && (
              <p className="text-xs text-muted-foreground truncate">
                {conv.lastMessage.text}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Option 3: Floating Chat Widget
 * Persistent at bottom-right of any page
 */
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState('default');
  const userId = useAuth()?.user?.id || '';

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 rounded-full bg-primary text-primary-foreground p-3 shadow-lg hover:shadow-xl"
      >
        💬
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 h-96 border rounded-lg shadow-2xl bg-background flex flex-col">
      {/* Header */}
      <div className="border-b p-3 flex justify-between items-center">
        <h3 className="font-semibold">Chat</h3>
        <button onClick={() => setOpen(false)} className="text-2xl">×</button>
      </div>

      {/* Messages */}
      <MessagesView
        conversationId={conversationId}
        currentUserId={userId}
      />
    </div>
  );
}

/**
 * Option 4: Modal Dialog
 * Open chat in a modal
 */
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface MessageModalProps {
  conversationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MessageModal({ conversationId, open, onOpenChange }: MessageModalProps) {
  const userId = useAuth()?.user?.id || '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-96 p-0 flex flex-col">
        <MessagesView
          conversationId={conversationId}
          currentUserId={userId}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Option 5: Two-Pane Layout
 * Conversations list + message detail
 */
export function ChatLayout() {
  const { conversations } = useMessaging();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    conversations[0]?.id || null
  );
  const userId = useAuth()?.user?.id || '';

  return (
    <div className="flex gap-4 h-screen">
      {/* Left: Conversations List */}
      <div className="w-64 border-r bg-muted/30">
        <div className="p-4 border-b">
          <h2 className="font-semibold mb-3">Conversations</h2>
          <Input placeholder="Search..." className="text-xs" />
        </div>

        <div className="space-y-1 p-2">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setSelectedConversationId(conv.id)}
              className={cn(
                'w-full text-left p-3 rounded-lg transition',
                selectedConversationId === conv.id
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted/50'
              )}
            >
              <p className="text-sm font-medium">
                {conv.displayName || conv.id}
              </p>
              {conv.lastMessage && (
                <p className="text-xs opacity-75 truncate">
                  {conv.lastMessage.text}
                </p>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Right: Messages */}
      {selectedConversationId ? (
        <MessagesView
          conversationId={selectedConversationId}
          currentUserId={userId}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Select a conversation
        </div>
      )}
    </div>
  );
}

/**
 * Option 6: Tab in Existing Layout
 * Messaging as a tab alongside calendar, tasks, etc.
 */
export function MainLayout({ activeTab }: { activeTab: string }) {
  const userId = useAuth()?.user?.id || '';

  return (
    <div className="flex-1">
      {activeTab === 'calendar' && <CalendarView />}
      {activeTab === 'tasks' && <TasksView />}
      {activeTab === 'messages' && (
        <MessagesView
          conversationId="main" // Or pass from URL params
          currentUserId={userId}
        />
      )}
    </div>
  );
}

/**
 * Quick Integration Checklist:
 * 
 * 1. ✅ Choose integration style (standalone, widget, modal, sidebar, etc.)
 * 2. ✅ Get userId from useAuth() hook
 * 3. ✅ Pass conversationId and userId to MessagesView
 * 4. ✅ MessagesView handles all messaging logic via useMessaging
 * 5. ✅ Styling via Tailwind (matches your design system)
 * 6. ✅ Done! Messaging works end-to-end
 * 
 * No other changes needed:
 * - No BlueBubbles imports in components
 * - No socket.io setup
 * - No event handling
 * - All handled by MessagesView + useMessaging hook
 */
