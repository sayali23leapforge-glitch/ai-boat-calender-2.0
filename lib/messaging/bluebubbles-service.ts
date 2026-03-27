/**
 * BlueBubbles Message Service Implementation
 * Encapsulates ALL BlueBubbles-specific logic:
 * - REST API calls
 * - WebSocket/socket.io connections
 * - Message reconciliation
 *
 * This file is the ONLY place BlueBubbles API details exist.
 * If we switch to Project Blue, only this file changes.
 */

import { IMessageService, Message, Conversation, MessageStatus, MessageServiceConfig } from './types';
import { processMessageForCalendarIntegration } from './message-event-parser';

interface PendingMessage {
  optimisticId: string;
  conversationId: string;
  text: string;
  sender: string;
  serverId?: string;
}

export class BlueBubblesMessageService implements IMessageService {
  private config: MessageServiceConfig;
  private connected: boolean = false;
  private socket: any = null;
  private pendingMessages: Map<string, PendingMessage> = new Map();

  // Subscription callbacks
  private messageCallbacks: Set<(message: Message) => void> = new Set();
  private statusCallbacks: Set<(messageId: string, status: MessageStatus) => void> = new Set();
  private connectionCallbacks: Set<(connected: boolean) => void> = new Set();
  private conversationCallbacks: Set<(conversation: Conversation) => void> = new Set();

  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 3000;

  constructor(config: MessageServiceConfig) {
    this.config = {
      reconnectAttempts: 5,
      reconnectDelay: 3000,
      ...config,
    };
  }

  /**
   * Initialize connection to BlueBubbles server
   */
  async initialize(): Promise<void> {
    try {
      // Dynamically import socket.io only when needed 
      const io = (await import('socket.io-client')).default;

      // Extract base URL without socket.io path
      const baseUrl = this.config.socketUrl.split('/socket.io')[0];

      this.socket = io(baseUrl, {
        reconnection: true,
        reconnectionDelay: this.config.reconnectDelay,
        reconnectionDelayMax: 10000,
        reconnectionAttempts: this.config.reconnectAttempts,
        transports: ['websocket', 'polling'],
      });

      // Setup event listeners
      this.setupSocketListeners();

      // Wait for connection to establish
      return new Promise(async (resolve, reject) => {
        let settled = false;
        const cleanupAndReject = (message: string) => {
          if (settled) return;
          settled = true;
          this.connected = false;
          this.notifyConnectionStatusChange(false);
          this.socket?.off('connect', connectHandler);
          this.socket?.off('connect_error', errorHandler);
          this.socket?.disconnect();
          this.socket = null;
          reject(new Error(message));
        };

        const connectHandler = async () => {
          if (settled) return;
          settled = true;
          this.connected = true;
          this.reconnectAttempts = 0;
          this.notifyConnectionStatusChange(true);
          console.log('✓ Connected to BlueBubbles server');
          
          // Verify connection by fetching conversations from iMessage
          try {
            const conversations = await this.getConversations();
            console.log(`✓ iMessage connected! Found ${conversations.length} conversations`);
            
            if (conversations.length > 0) {
              console.log('✓ Successfully fetched iMessage conversations:');
              conversations.slice(0, 3).forEach(conv => {
                console.log(`  - ${conv.displayName || conv.participants.join(', ')}`);
              });
            }
          } catch (error) {
            console.warn('Could not fetch conversations immediately:', error instanceof Error ? error.message : 'Unknown error');
          }

          clearTimeout(timeout);
          resolve();
        };

        const errorHandler = (error: any) => {
          console.error('BlueBubbles connection error:', error);
          cleanupAndReject(`Failed to connect to BlueBubbles server: ${error?.message || 'Unknown error'}`);
        };

        this.socket.on('connect', connectHandler);
        this.socket.on('connect_error', errorHandler);

        // Timeout after 15 seconds
        const timeout = setTimeout(() => {
          cleanupAndReject('Connection timeout - BlueBubbles server not responding');
        }, 15000);
      });
    } catch (error) {
      console.error('BlueBubbles initialization error:', error);
      throw error;
    }
  }

  /**
   * Setup all BlueBubbles WebSocket event listeners
   */
  private setupSocketListeners(): void {
    if (!this.socket) return;

    // Handle incoming messages
    this.socket.on('message', (data: any) => {
      const message: Message = {
        id: data.id || `msg_${Date.now()}`,
        conversationId: data.conversationId || data.chatId,
        sender: data.from || data.sender,
        text: data.text || data.body,
        timestamp: data.timestamp || Date.now(),
        status: 'delivered',
        attachments: data.attachments || data.media || [],
      };

      // Notify all subscribers
      this.messageCallbacks.forEach((cb) => cb(message));

      // Process images from attachments
      if (message.attachments && message.attachments.length > 0) {
        this.processImageAttachments(message).catch((error) => {
          console.error('Error processing image attachments:', error);
        });
      }

      // Process message for calendar event extraction
      processMessageForCalendarIntegration(message).catch((error) => {
        console.error('Error processing message for calendar:', error);
      });
    });

    // Handle message ACKs (sent confirmation)
    this.socket.on('message:ack', (data: any) => {
      const optimisticId = data.optimisticId || data.pendingId;
      const serverId = data.id || data.serverId;

      if (optimisticId && this.pendingMessages.has(optimisticId)) {
        const pending = this.pendingMessages.get(optimisticId)!;
        pending.serverId = serverId;
        this.notifyStatusChange(optimisticId, 'sent');
      }
    });

    // Handle delivery confirmation
    this.socket.on('message:delivered', (data: any) => {
      const messageId = data.messageId || data.id;
      this.notifyStatusChange(messageId, 'delivered');
    });

    // Handle read receipts
    this.socket.on('message:read', (data: any) => {
      const messageId = data.messageId || data.id;
      this.notifyStatusChange(messageId, 'read');
    });

    // Handle conversation updates
    this.socket.on('conversation:update', (data: any) => {
      const conversation: Conversation = {
        id: data.id || data.chatId,
        participants: data.participants || [],
        displayName: data.displayName,
        lastUpdated: Date.now(),
      };
      this.conversationCallbacks.forEach((cb) => cb(conversation));
    });

    // Handle connection loss
    this.socket.on('disconnect', () => {
      this.connected = false;
      this.notifyConnectionStatusChange(false);
    });

    // Handle errors
    this.socket.on('error', (error: any) => {
      console.error('BlueBubbles socket error:', error);
    });
  }

  /**
   * Send a message with optimistic UI
   * Returns optimisticId immediately (before server confirmation)
   */
  async sendMessage(conversationId: string, text: string, sender: string): Promise<string> {
    const optimisticId = `opt_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Store pending message for reconciliation
    this.pendingMessages.set(optimisticId, {
      optimisticId,
      conversationId,
      text,
      sender,
    });

    // Notify subscribers of "sending" status immediately (optimistic)
    this.notifyStatusChange(optimisticId, 'sending');

    try {
      // Send to server
      if (this.socket?.connected) {
        // Use socket.io emit for real-time
        this.socket.emit('message:send', {
          optimisticId,
          conversationId,
          text,
          sender,
          timestamp: Date.now(),
        });
      } else {
        // Fallback to REST API if socket not available
        const response = await fetch(
          `${this.config.baseUrl}/api/message/send`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              optimisticId,
              conversationId,
              text,
              sender,
            }),
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to send message: ${response.statusText}`);
        }

        const data = await response.json();
        const pending = this.pendingMessages.get(optimisticId);
        if (pending) {
          pending.serverId = data.id;
        }
      }

      return optimisticId;
    } catch (error) {
      console.error('Error sending message:', error);
      this.notifyStatusChange(optimisticId, 'failed');
      throw error;
    }
  }

  /**
   * Get conversation history from server
   */
  async getConversation(conversationId: string, limit: number = 50): Promise<Message[]> {
    try {
      const response = await fetch(
        `${this.config.baseUrl}/api/conversations/${conversationId}/messages?limit=${limit}`,
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch conversation: ${response.statusText}`);
      }

      const data = await response.json();
      return (data.messages || []).map((msg: any) => ({
        id: msg.id,
        conversationId: msg.conversationId || conversationId,
        sender: msg.sender || msg.from,
        text: msg.text || msg.body,
        timestamp: msg.timestamp || Date.now(),
        status: 'delivered' as MessageStatus,
        attachments: msg.attachments,
      }));
    } catch (error) {
      console.error('Error fetching conversation:', error);
      return [];
    }
  }

  /**
   * Get all conversations
   */
  async getConversations(): Promise<Conversation[]> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/conversations`, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        // BlueBubbles API doesn't support this endpoint yet, return empty array silently
        if (response.status === 404) {
          return [];
        }
        throw new Error(`Failed to fetch conversations: ${response.statusText}`);
      }

      const data = await response.json();
      return (data.conversations || []).map((conv: any) => ({
        id: conv.id,
        participants: conv.participants || [],
        displayName: conv.displayName,
        lastUpdated: conv.lastUpdated || Date.now(),
      }));
    } catch (error) {
      // Silently handle 404 (endpoint not supported)
      if (error instanceof Error && error.message.includes('404')) {
        return [];
      }
      console.error('Error fetching conversations:', error);
      return [];
    }
  }

  /**
   * Subscribe to incoming messages
   */
  onMessage(callback: (message: Message) => void): () => void {
    this.messageCallbacks.add(callback);
    // Return unsubscribe function
    return () => {
      this.messageCallbacks.delete(callback);
    };
  }

  /**
   * Subscribe to message status updates
   */
  onMessageStatus(callback: (messageId: string, status: MessageStatus) => void): () => void {
    this.statusCallbacks.add(callback);
    return () => {
      this.statusCallbacks.delete(callback);
    };
  }

  /**
   * Subscribe to connection status changes
   */
  onConnectionStatusChange(callback: (connected: boolean) => void): () => void {
    this.connectionCallbacks.add(callback);
    return () => {
      this.connectionCallbacks.delete(callback);
    };
  }

  /**
   * Subscribe to conversation updates
   */
  onConversationUpdate(callback: (conversation: Conversation) => void): () => void {
    this.conversationCallbacks.add(callback);
    return () => {
      this.conversationCallbacks.delete(callback);
    };
  }

  /**
   * Mark message as read
   */
  async markAsRead(conversationId: string, messageId: string): Promise<void> {
    try {
      if (this.socket?.connected) {
        this.socket.emit('message:markAsRead', { conversationId, messageId });
      } else {
        await fetch(`${this.config.baseUrl}/api/message/read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId, messageId }),
        });
      }
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  }

  /**
   * Retry sending a failed message
   */
  async retrySendMessage(messageId: string): Promise<void> {
    const pending = this.pendingMessages.get(messageId);
    if (!pending) {
      throw new Error(`Message ${messageId} not found`);
    }

    try {
      this.notifyStatusChange(messageId, 'sending');
      await this.sendMessage(pending.conversationId, pending.text, pending.sender);
    } catch (error) {
      this.notifyStatusChange(messageId, 'failed');
      throw error;
    }
  }

  /**
   * Disconnect from server
   */
  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.disconnect();
      this.connected = false;
      this.notifyConnectionStatusChange(false);
    }
  }

  /**
   * Check connection status
   */
  isConnected(): boolean {
    return this.connected && this.socket?.connected;
  }

  /**
   * Process image attachments from messages
   */
  private async processImageAttachments(message: Message): Promise<void> {
    if (!message.attachments || message.attachments.length === 0) return;

    try {
      for (const attachment of message.attachments) {
        if (this.isImageFile(attachment)) {
          console.log(`📸 Processing image attachment: ${attachment}`);

          // Call the image processing API
          const response = await fetch('/api/images/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageUrl: attachment,
              userId: message.conversationId, // Use conversation as user ID for now
              conversationId: message.conversationId,
              sender: message.sender,
              createEvents: true,
            }),
          });

          if (response.ok) {
            const result = await response.json();
            console.log(`✓ Image processed: ${result.imageUpload.extractedDates.length} date(s) found`);
          }
        }
      }
    } catch (error) {
      console.error('Error processing image attachments:', error);
    }
  }

  /**
   * Check if attachment is an image file
   */
  private isImageFile(attachment: string): boolean {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    return imageExtensions.some((ext) => attachment.toLowerCase().endsWith(ext));
  }

  // ============= Private Helpers =============

  /**
   * Notify all status change subscribers
   */
  private notifyStatusChange(messageId: string, status: MessageStatus): void {
    this.statusCallbacks.forEach((cb) => cb(messageId, status));
  }

  /**
   * Notify all connection status subscribers
   */
  private notifyConnectionStatusChange(connected: boolean): void {
    this.connectionCallbacks.forEach((cb) => cb(connected));
  }
}
