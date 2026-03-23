/**
 * Messaging Service Exports
 * Single entry point for all messaging functionality
 */

export {
  getMessageService,
  resetMessageService,
  type IMessageService,
  type Message,
  type Conversation,
  type MessageStatus,
} from './service-selector';

export { BlueBubblesMessageService } from './bluebubbles-service';
export type { MessageServiceConfig } from './types';

export {
  parseMessageForEvent,
  processMessageForCalendarIntegration,
  type MessageEventResult,
} from './message-event-parser';

