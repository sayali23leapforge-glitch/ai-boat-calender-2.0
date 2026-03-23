/**
 * Message-to-Event Parser
 * Intercepts BlueBubbles messages and parses them to extract calendar events
 * Automatically creates calendar events when event-related messages are detected
 */

import { Message } from './types';
import { parseNaturalLanguageInput, ParsedInput } from '../ai-parser';
import { createCalendarEvent } from '../calendar-events';
import { supabase } from '../supabase';

export interface MessageEventResult {
  success: boolean;
  eventId?: string;
  message: string;
  parsed?: ParsedInput;
}

/**
 * Parse a message and extract calendar event information
 * Returns null if no event data is found in the message
 */
export async function parseMessageForEvent(message: Message): Promise<MessageEventResult> {
  try {
    // Skip certain types of messages
    if (!message.text || message.text.trim().length === 0) {
      return { success: false, message: 'Empty message text' };
    }

    // Try to parse the message as natural language input
    const parsed = await parseNaturalLanguageInput(message.text);

    // Only process if this is identified as an event
    if (parsed.type !== 'event') {
      return { success: false, message: `Not an event (detected as: ${parsed.type})` };
    }

    // Check if we have sufficient confidence
    if (parsed.confidence < 0.5) {
      return { success: false, message: `Low confidence score: ${parsed.confidence}` };
    }

    // Get user ID from current session
    let userId: string | null = null;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      userId = session?.user?.id || null;
    } catch (error) {
      console.warn('Failed to get session:', error);
    }

    if (!userId) {
      return { success: false, message: 'No authenticated user - session not available' };
    }

    // Create the calendar event
    const eventData = {
      user_id: userId,
      title: parsed.title,
      description: `From message: "${message.text}"\nSender: ${message.sender}`,
      event_date: parsed.date || new Date().toISOString().split('T')[0],
      start_time: parsed.time,
      end_time: parsed.endTime,
      location: parsed.location,
      category: 'meeting' as const,
      priority: parsed.priority || 'medium' as const,
      source: 'extracted' as const,
      source_id: message.id,
      is_completed: false,
    };

    const createdEvent = await createCalendarEvent(eventData);

    return {
      success: true,
      eventId: createdEvent.id,
      message: `Calendar event created: "${parsed.title}"`,
      parsed,
    };
  } catch (error) {
    console.error('Error parsing message for event:', error);
    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Process incoming messages and automatically create calendar events
 * Should be called from BlueBubbles message handler
 */
export async function processMessageForCalendarIntegration(message: Message): Promise<void> {
  try {
    const result = await parseMessageForEvent(message);

    if (result.success) {
      console.log(`✅ Calendar event created from message: ${result.message}`);
    } else {
      console.log(`ℹ️ Message processed (not an event): ${result.message}`);
    }
  } catch (error) {
    console.error('Failed to process message for calendar integration:', error);
  }
}
