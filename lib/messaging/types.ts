/**
 * Message and Messaging Service Type Definitions
 * Platform-agnostic types used across BlueBubbles and future backends
 */

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface Message {
  id: string;
  conversationId: string;
  sender: string;
  text: string;
  timestamp: number;
  status: MessageStatus;
  attachments?: string[];
}

export interface Conversation {
  id: string;
  participants: string[];
  lastMessage?: Message;
  lastUpdated: number;
  displayName?: string;
}

export interface MessageServiceConfig {
  baseUrl: string;
  socketUrl: string;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export interface IMessageService {
  /**
   * Initialize the message service (connect to server, setup listeners)
   */
  initialize(): Promise<void>;

  /**
   * Disconnect from message service
   */
  disconnect(): Promise<void>;

  /**
   * Check if service is connected
   */
  isConnected(): boolean;

  /**
   * Send a message
   * Returns optimistic message ID immediately
   */
  sendMessage(
    conversationId: string,
    text: string,
    sender: string
  ): Promise<string>; // Returns optimisticId

  /**
   * Get conversation history
   */
  getConversation(conversationId: string, limit?: number): Promise<Message[]>;

  /**
   * Get all conversations
   */
  getConversations(): Promise<Conversation[]>;

  /**
   * Subscribe to incoming messages
   * Callback receives messages as they arrive
   */
  onMessage(callback: (message: Message) => void): () => void; // Returns unsubscribe function

  /**
   * Subscribe to message status updates (ACK, delivery, read)
   */
  onMessageStatus(callback: (messageId: string, status: MessageStatus) => void): () => void;

  /**
   * Subscribe to connection status changes
   */
  onConnectionStatusChange(callback: (connected: boolean) => void): () => void;

  /**
   * Subscribe to conversation updates
   */
  onConversationUpdate(callback: (conversation: Conversation) => void): () => void;

  /**
   * Mark message as read
   */
  markAsRead(conversationId: string, messageId: string): Promise<void>;

  /**
   * Retry sending a failed message
   */
  retrySendMessage(messageId: string): Promise<void>;
}
