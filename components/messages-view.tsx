/**
 * MessagesView Component
 * Clean UI component that uses the messaging hook
 * No BlueBubbles logic - just pure React
 */

'use client';

import React, { useEffect, useRef } from 'react';
import { useMessaging } from '@/hooks/use-messaging';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Send, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface MessagesViewProps {
  conversationId: string;
  currentUserId: string;
}

export function MessagesView({ conversationId, currentUserId }: MessagesViewProps) {
  const {
    messages,
    connected,
    loading,
    error,
    sendMessage,
    fetchConversation,
    markAsRead,
    retrySendMessage,
  } = useMessaging();

  const [input, setInput] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversation history on mount
  useEffect(() => {
    fetchConversation(conversationId);
  }, [conversationId, fetchConversation]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();

    if (!text || sending || !connected) return;

    try {
      setSending(true);
      await sendMessage(conversationId, text, currentUserId);
      setInput('');
      toast.success('Message sent');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleRetry = async (messageId: string) => {
    try {
      await retrySendMessage(messageId);
      toast.success('Message retry sent');
    } catch (error) {
      toast.error('Failed to retry message');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading messages...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Connection Status */}
      {!connected && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2">
          <p className="text-xs text-yellow-800">Reconnecting...</p>
        </div>
      )}

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.optimisticId}
              className={cn(
                'flex gap-2 max-w-xs',
                message.sender === currentUserId ? 'ml-auto flex-row-reverse' : ''
              )}
            >
              <div
                className={cn(
                  'rounded-lg px-4 py-2 break-words',
                  message.sender === currentUserId
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                )}
              >
                <p className="text-sm">{message.text}</p>
                <p className="text-xs mt-1 opacity-70">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </p>
              </div>

              {/* Message Status Indicator */}
              {message.sender === currentUserId && (
                <div className="flex flex-col justify-end">
                  {message.status === 'sending' && (
                    <span className="text-xs text-muted-foreground">⏳ Sending...</span>
                  )}
                  {message.status === 'sent' && (
                    <span className="text-xs text-muted-foreground">✓ Sent</span>
                  )}
                  {message.status === 'delivered' && (
                    <span className="text-xs text-muted-foreground">✓✓ Delivered</span>
                  )}
                  {message.status === 'read' && (
                    <span className="text-xs text-muted-foreground">✓✓ Read</span>
                  )}
                  {message.status === 'failed' && (
                    <button
                      onClick={() => handleRetry(message.optimisticId)}
                      className="text-xs text-destructive hover:underline"
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} className="border-t border-border p-4 bg-muted/30 space-y-2">
        <div className="flex gap-2">
          <Input
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!connected || sending}
            className="flex-1"
          />
          <Button
            type="submit"
            disabled={!connected || sending || !input.trim()}
            size="icon"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        {!connected && (
          <p className="text-xs text-yellow-700">Waiting for connection...</p>
        )}
      </form>
    </div>
  );
}
