/**
 * Message Service Selector
 *
 * ⚠️ THIS IS THE ONLY FILE THAT CHANGES WHEN SWAPPING BACKENDS
 *
 * To switch from BlueBubbles to Project Blue:
 * 1. Create ProjectBlueService implementing IMessageService
 * 2. Change the factory function below to return ProjectBlueService
 * 3. Done - no other changes needed!
 */

import { IMessageService, MessageServiceConfig } from './types';
import { BlueBubblesMessageService } from './bluebubbles-service';

let serviceInstance: IMessageService | null = null;

/**
 * Get or create the message service singleton
 * Currently returns BlueBubblesMessageService
 * Change this to ProjectBlueService when backend switches
 */
export function getMessageService(): IMessageService {
  if (!serviceInstance) {
    const config: MessageServiceConfig = {
      baseUrl: process.env.NEXT_PUBLIC_BLUEBUBBLES_BASE_URL || '',
      socketUrl: process.env.NEXT_PUBLIC_BLUEBUBBLES_SOCKET_URL || '',
      reconnectAttempts: 5,
      reconnectDelay: 3000,
    };

    // 🔄 SWAP BACKEND HERE ONLY
    serviceInstance = new BlueBubblesMessageService(config);
  }

  return serviceInstance;
}

/**
 * Reset service (useful for testing or switching backends at runtime)
 */
export function resetMessageService(): void {
  serviceInstance = null;
}

/**
 * Export the interface for type safety in components
 */
export type { IMessageService, Message, Conversation, MessageStatus } from './types';
