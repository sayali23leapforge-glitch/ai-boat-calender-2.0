/**
 * useMessaging Hook
 * Provides a clean React interface to the messaging service
 * Handles optimistic updates, status tracking, and subscriptions
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { getMessageService, type Message, type MessageStatus, type Conversation } from '@/lib/messaging/service-selector';

interface OptimisticMessage extends Message {
  optimisticId: string;
}

interface UseMessagingState {
  messages: OptimisticMessage[];
  conversations: Conversation[];
  connected: boolean;
  loading: boolean;
  error: string | null;
}

interface UseMessagingActions {
  sendMessage: (conversationId: string, text: string, sender: string) => Promise<string>;
  fetchConversation: (conversationId: string) => Promise<void>;
  fetchConversations: () => Promise<void>;
  markAsRead: (conversationId: string, messageId: string) => Promise<void>;
  retrySendMessage: (messageId: string) => Promise<void>;
}

export function useMessaging(): UseMessagingState & UseMessagingActions {
  const [state, setState] = useState<UseMessagingState>({
    messages: [],
    conversations: [],
    connected: false,
    loading: true,
    error: null,
  });

  const serviceRef = useRef(getMessageService());
  const unsubscribesRef = useRef<Array<() => void>>([]);
  const messageStatusRef = useRef<Map<string, MessageStatus>>(new Map());

  /**
   * Initialize service and setup listeners
   */
  useEffect(() => {
    const service = serviceRef.current;

    const initializeService = async () => {
      try {
        console.log('Initializing BlueBubbles messaging service...');
        await service.initialize();
        console.log('✓ BlueBubbles service initialized successfully');
        setState((prev) => ({ ...prev, connected: true, loading: false }));
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Failed to initialize messaging';
        console.error('❌ Messaging initialization failed:', errorMsg);
        setState((prev) => ({
          ...prev,
          error: errorMsg,
          loading: false,
        }));
      }
    };

    initializeService();

    // Setup message listener
    const unsubMessage = service.onMessage((message) => {
      setState((prev) => ({
        ...prev,
        messages: [
          ...prev.messages.filter((m) => m.id !== message.id), // Remove if duplicate
          { ...message, optimisticId: message.id },
        ].sort((a, b) => a.timestamp - b.timestamp),
      }));
    });

    // Setup status listener for optimistic UI reconciliation
    const unsubStatus = service.onMessageStatus((messageId, status) => {
      messageStatusRef.current.set(messageId, status);

      setState((prev) => ({
        ...prev,
        messages: prev.messages.map((msg) =>
          msg.id === messageId || msg.optimisticId === messageId ? { ...msg, status } : msg
        ),
      }));
    });

    // Setup connection listener
    const unsubConnection = service.onConnectionStatusChange((connected) => {
      setState((prev) => ({ ...prev, connected }));
    });

    // Setup conversation listener
    const unsubConversation = service.onConversationUpdate((conversation) => {
      setState((prev) => ({
        ...prev,
        conversations: [
          ...prev.conversations.filter((c) => c.id !== conversation.id),
          conversation,
        ].sort((a, b) => b.lastUpdated - a.lastUpdated),
      }));
    });

    unsubscribesRef.current = [unsubMessage, unsubStatus, unsubConnection, unsubConversation];

    // Cleanup on unmount
    return () => {
      unsubscribesRef.current.forEach((unsub) => unsub());
      service.disconnect();
    };
  }, []);

  /**
   * Send message with optimistic UI
   */
  const sendMessage = useCallback(
    async (conversationId: string, text: string, sender: string) => {
      const optimisticId = await serviceRef.current.sendMessage(conversationId, text, sender);

      // Immediately add optimistic message to UI
      const optimisticMessage: OptimisticMessage = {
        id: optimisticId,
        optimisticId,
        conversationId,
        sender,
        text,
        timestamp: Date.now(),
        status: 'sending',
      };

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, optimisticMessage].sort((a, b) => a.timestamp - b.timestamp),
      }));

      return optimisticId;
    },
    []
  );

  /**
   * Fetch conversation history
   */
  const fetchConversation = useCallback(async (conversationId: string) => {
    try {
      const messages = await serviceRef.current.getConversation(conversationId);
      setState((prev) => ({
        ...prev,
        messages: messages.map((m) => ({ ...m, optimisticId: m.id })),
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to fetch conversation',
      }));
    }
  }, []);

  /**
   * Fetch all conversations
   */
  const fetchConversations = useCallback(async () => {
    try {
      const conversations = await serviceRef.current.getConversations();
      setState((prev) => ({
        ...prev,
        conversations: conversations.sort((a, b) => b.lastUpdated - a.lastUpdated),
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to fetch conversations',
      }));
    }
  }, []);

  /**
   * Mark message as read
   */
  const markAsRead = useCallback(async (conversationId: string, messageId: string) => {
    try {
      await serviceRef.current.markAsRead(conversationId, messageId);
    } catch (error) {
      console.error('Failed to mark message as read:', error);
    }
  }, []);

  /**
   * Retry failed message
   */
  const retrySendMessage = useCallback(async (messageId: string) => {
    try {
      await serviceRef.current.retrySendMessage(messageId);
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to retry message',
      }));
    }
  }, []);

  return {
    ...state,
    sendMessage,
    fetchConversation,
    fetchConversations,
    markAsRead,
    retrySendMessage,
  };
}
